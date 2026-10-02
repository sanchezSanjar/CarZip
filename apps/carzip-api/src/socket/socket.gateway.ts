import { Logger } from '@nestjs/common';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

/** "how many people are in the chat", sent when someone connects or leaves */
interface InfoPayload {
	event: 'info';
	totalClients: number;
}

/** one chat message, sent to everyone */
interface MessagePayload {
	event: 'message';
	text: string;
	createdAt: string;
}

/** something the sender did wrong, sent only to the sender */
interface ErrorPayload {
	event: 'error';
	message: string;
}

type OutgoingPayload = InfoPayload | MessagePayload | ErrorPayload;

const MESSAGE_MAX_LENGTH = 500;
const RATE_LIMIT_COUNT = 5; // at most 5 messages ...
const RATE_LIMIT_WINDOW = 5_000; // ... per 5 seconds per connection

/**
 * Chat room on the API port (plain WebSocket, ws://host:PORT_API).
 * Client sends:   { "event": "message", "data": "hello" }
 * Server sends:   { "event": "info", totalClients } on every join / leave,
 *                 { "event": "message", text, createdAt } to everyone,
 *                 { "event": "error", message } to the sender only.
 * Who sent a message (login with a token) comes in the next stage.
 */
@WebSocketGateway({
	transports: ['websocket'],
	maxPayload: 64 * 1024, // one frame is at most 64 KB: a client can't flood the server's memory
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger('SocketGateway');
	/** send times of each connection's recent messages, for the spam limit (gone with the socket) */
	private readonly sentAt = new WeakMap<WebSocket, number[]>();

	@WebSocketServer()
	private server: Server;

	public afterInit(): void {
		this.logger.log('WebSocket server initialized');
	}

	public handleConnection(): void {
		// server.clients is the server's own set of open sockets: always right, unlike a hand-kept ++ / -- counter
		const totalClients = this.server.clients.size;
		this.logger.log(`Client connected, total: ${totalClients}`);
		this.emitMessage({ event: 'info', totalClients });
	}

	public handleDisconnect(): void {
		// the closed socket has already left server.clients, so this reaches only the ones still here
		const totalClients = this.server.clients.size;
		this.logger.log(`Client disconnected, total: ${totalClients}`);
		this.emitMessage({ event: 'info', totalClients });
	}

	@SubscribeMessage('message')
	public handleMessage(client: WebSocket, payload: unknown): void {
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

		// the text is not logged: chat content is the members' private data
		this.logger.log(`New message (${text.length} chars)`);
		this.emitMessage({ event: 'message', text, createdAt: new Date().toISOString() });
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

	/** every open client */
	private emitMessage(message: OutgoingPayload): void {
		const data = JSON.stringify(message);
		this.server.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) client.send(data);
		});
	}
}
