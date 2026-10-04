import { ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import { Model } from 'mongoose';
import { Server, WebSocket } from 'ws';
import { AuthService } from '../components/auth/auth.service';
import { Member } from '../libs/dto/member/member';
import { MemberType } from '@app/common/enums/member.enum';
import { RedisService } from '@app/common/redis/redis.service';

/** who sent a message / joined: PUBLIC fields only. null = guest */
interface ChatMember {
	_id: string;
	memberNick: string;
	memberImage?: string;
	memberType: MemberType;
}

/** someone joined or left; totalClients = how many are in the chat now */
interface InfoPayload {
	event: 'info';
	totalClients: number;
	memberData: ChatMember | null;
	action: 'joined' | 'left';
}

/** one chat message, sent to everyone */
interface MessagePayload {
	event: 'message';
	text: string;
	memberData: ChatMember;
	createdAt: string;
}

/** the latest messages, sent to a client right after it joins */
interface MessagesPayload {
	event: 'getMessages';
	list: MessagePayload[];
}

/** something the sender did wrong, sent only to the sender */
interface ErrorPayload {
	event: 'error';
	message: string;
}

type OutgoingPayload = InfoPayload | MessagePayload | MessagesPayload | ErrorPayload;

/** a connection that passed the login check */
interface ChatClient {
	token: string | null; // kept to re-check the member on every message
	member: ChatMember | null;
}

const MESSAGE_MAX_LENGTH = 500;
const MESSAGE_HISTORY = 20; // how many recent messages a newcomer receives
const RATE_LIMIT_COUNT = 5; // at most 5 messages ...
const RATE_LIMIT_WINDOW = 5_000; // ... per 5 seconds per connection

// Redis: the history list (newest first) and the channel that carries new messages to every API server
const HISTORY_KEY = 'chat:messages';
const MESSAGE_CHANNEL = 'chat:message';

// close codes 4000-4999 are free for applications: the client can tell why it was disconnected
const CLOSE_UNAUTHORIZED = 4001; // bad / expired token: log in again (or reconnect without a token as a guest)
const CLOSE_FORBIDDEN = 4003; // blocked member

/**
 * Chat room on the API port (plain WebSocket).
 * Connect:        ws://host:PORT_API?token=<accessToken>   (no token = guest)
 *                 Browsers can't set headers on a WebSocket, so the token travels in the URL.
 * Client sends:   { "event": "message", "data": "hello" }
 * Server sends:   { "event": "getMessages", list } to a newcomer (latest messages),
 *                 { "event": "info", totalClients, memberData, action: "joined" | "left" } to everyone,
 *                 { "event": "message", text, memberData, createdAt } to everyone,
 *                 { "event": "error", message } to the sender only.
 * Guests read only; logged-in ACTIVE members write.
 * With Redis, the last messages live in a Redis list and new messages go out through Redis pub/sub,
 * so several API servers share one chat. Without Redis, both stay inside this server's memory.
 * Messages are never written to the database: after a restart of Redis (or of the API, without Redis) they're gone.
 * The online count (totalClients) is per server.
 */
@WebSocketGateway({
	transports: ['websocket'],
	maxPayload: 64 * 1024, // one frame is at most 64 KB: a client can't flood the server's memory
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger('SocketGateway');
	/** connections that passed the login check. Only these receive messages and count in totalClients */
	private readonly clients = new Map<WebSocket, ChatClient>();
	/** login check still running: a message sent meanwhile waits for it instead of being treated as a guest's */
	private readonly pending = new WeakMap<WebSocket, Promise<ChatClient | null>>();
	/** send times of each connection's recent messages, for the spam limit (gone with the socket) */
	private readonly sentAt = new WeakMap<WebSocket, number[]>();
	/** the message of each connection that is being handled now; the next one waits for it */
	private readonly queues = new WeakMap<WebSocket, Promise<void>>();
	/** the last messages in memory: used while Redis is not available */
	private readonly messageList: MessagePayload[] = [];

	@WebSocketServer()
	private server: Server;

	constructor(
		private readonly authService: AuthService,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
		private readonly redis: RedisService,
	) {}

	public afterInit(): void {
		this.logger.log('WebSocket server initialized');
		// every server (this one too) hears each published message and sends it to its own clients
		const subscriber = this.redis.subscriber;
		if (!subscriber) return;
		subscriber.on('message', (channel: string, data: string) => {
			if (channel === MESSAGE_CHANNEL) this.emitData(data);
		});
		subscriber.subscribe(MESSAGE_CHANNEL).catch((err: Error) => this.logger.warn(`chat subscribe failed: ${err.message}`));
	}

	public async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
		const login = this.login(client, req);
		this.pending.set(client, login);
		const chatClient = await login;
		// read before joining: a new message can't reach this client before its history does
		const list = chatClient ? await this.recentMessages() : [];
		this.pending.delete(client);
		// refused, or the client left while we were checking: nothing to announce
		if (!chatClient || client.readyState !== WebSocket.OPEN) return;

		this.clients.set(client, chatClient);
		this.logger.log(`[${chatClient.member?.memberNick ?? 'Guest'}] joined, total: ${this.clients.size}`);
		this.sendTo(client, { event: 'getMessages', list });
		this.emitMessage({
			event: 'info',
			totalClients: this.clients.size,
			memberData: chatClient.member,
			action: 'joined',
		});
	}

	public handleDisconnect(client: WebSocket): void {
		const chatClient = this.clients.get(client);
		if (!chatClient) return; // never joined (refused or still being checked)
		this.clients.delete(client);
		this.logger.log(`[${chatClient.member?.memberNick ?? 'Guest'}] left, total: ${this.clients.size}`);
		this.emitMessage({ event: 'info', totalClients: this.clients.size, memberData: chatClient.member, action: 'left' });
	}

	/**
	 * One connection's messages are handled one after another. Each message waits for the member check (DB),
	 * and without this queue "1, 2, 3" could reach the others as "2, 1, 3".
	 */
	@SubscribeMessage('message')
	public handleMessage(client: WebSocket, payload: unknown): Promise<void> {
		const next = (this.queues.get(client) ?? Promise.resolve())
			.then(() => this.processMessage(client, payload))
			.catch((err: unknown) => this.logger.error(`message failed: ${err instanceof Error ? err.message : err}`));
		this.queues.set(client, next);
		return next;
	}

	private async processMessage(client: WebSocket, payload: unknown): Promise<void> {
		const chatClient = this.clients.get(client) ?? (await this.pending.get(client));
		if (!chatClient) return; // refused connection
		if (!chatClient.token) return this.sendTo(client, { event: 'error', message: 'Log in to send messages.' });

		const text = typeof payload === 'string' ? payload.trim() : '';
		if (!text || text.length > MESSAGE_MAX_LENGTH) {
			return this.sendTo(client, {
				event: 'error',
				message: `A message must be text of 1 to ${MESSAGE_MAX_LENGTH} characters.`,
			});
		}
		if (this.isRateLimited(client)) {
			return this.sendTo(client, { event: 'error', message: 'You are sending messages too fast. Please slow down.' });
		}

		// the member may have been blocked, changed the password or changed the nick since connecting
		const member = await this.loadMember(client, chatClient.token);
		if (!member) return;
		chatClient.member = member;

		const message: MessagePayload = { event: 'message', text, memberData: member, createdAt: new Date().toISOString() };
		this.messageList.push(message);
		if (this.messageList.length > MESSAGE_HISTORY) this.messageList.shift();

		// the text is not logged: chat content is the members' private data
		this.logger.log(`[${member.memberNick}] new message (${text.length} chars)`);
		await this.publish(message);
	}

	/** the last MESSAGE_HISTORY messages, oldest first: from Redis, or from memory while Redis is not available */
	private async recentMessages(): Promise<MessagePayload[]> {
		if (!this.redis.isReady) return [...this.messageList];
		try {
			const items = await this.redis.client!.lrange(HISTORY_KEY, 0, MESSAGE_HISTORY - 1);
			return items.map((item) => JSON.parse(item) as MessagePayload).reverse();
		} catch (err) {
			this.logger.warn(`chat history read failed: ${(err as Error).message}`);
			return [...this.messageList];
		}
	}

	/**
	 * Keep the message in the Redis history (only the newest MESSAGE_HISTORY stay) and publish it to every server.
	 * Without Redis it goes straight to this server's clients.
	 */
	private async publish(message: MessagePayload): Promise<void> {
		const data = JSON.stringify(message);
		if (this.redis.isReady && this.redis.subscriber?.status === 'ready') {
			try {
				await this.redis
					.client!.multi()
					.lpush(HISTORY_KEY, data)
					.ltrim(HISTORY_KEY, 0, MESSAGE_HISTORY - 1)
					.publish(MESSAGE_CHANNEL, data)
					.exec();
				return; // our own subscriber delivers it to this server's clients
			} catch (err) {
				this.logger.warn(`chat publish failed, sending locally: ${(err as Error).message}`);
			}
		}
		this.emitData(data);
	}

	/** no token -> guest. Token -> the member, or the connection is closed (null) */
	private async login(client: WebSocket, req: IncomingMessage): Promise<ChatClient | null> {
		const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token');
		if (!token) return { token: null, member: null };
		const member = await this.loadMember(client, token);
		return member ? { token, member } : null;
	}

	/**
	 * Same check as the HTTP guards (AuthService.authenticate: token valid, member ACTIVE, password not changed since),
	 * plus the public profile for memberData. On failure the client gets the reason and is disconnected.
	 */
	private async loadMember(client: WebSocket, token: string): Promise<ChatMember | null> {
		try {
			const auth = await this.authService.authenticate(`Bearer ${token}`);
			const profile = await this.memberModel.findById(auth._id).select('memberImage').lean<Member>().exec();
			return {
				_id: String(auth._id),
				memberNick: auth.memberNick,
				memberImage: profile?.memberImage,
				memberType: auth.memberType,
			};
		} catch (err) {
			const blocked = err instanceof ForbiddenException;
			const message = blocked ? 'Your account is blocked.' : 'Your session is invalid or expired. Please log in again.';
			this.sendTo(client, { event: 'error', message });
			client.close(blocked ? CLOSE_FORBIDDEN : CLOSE_UNAUTHORIZED, blocked ? 'Forbidden' : 'Unauthorized');
			return null;
		}
	}

	/** true when this connection already sent RATE_LIMIT_COUNT messages in the last RATE_LIMIT_WINDOW */
	private isRateLimited(client: WebSocket): boolean {
		const now = Date.now();
		const recent = (this.sentAt.get(client) ?? []).filter((time) => now - time < RATE_LIMIT_WINDOW);
		if (recent.length >= RATE_LIMIT_COUNT) return true;
		recent.push(now);
		this.sentAt.set(client, recent);
		return false;
	}

	/** only this client */
	private sendTo(client: WebSocket, message: OutgoingPayload): void {
		if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
	}

	/** every client in the chat */
	private emitMessage(message: OutgoingPayload): void {
		this.emitData(JSON.stringify(message));
	}

	/** every client in the chat, an already encoded message */
	private emitData(data: string): void {
		this.clients.forEach((_chatClient, client) => {
			if (client.readyState === WebSocket.OPEN) client.send(data);
		});
	}
}
