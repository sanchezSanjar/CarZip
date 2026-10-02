import { Logger } from '@nestjs/common';
import {
	OnGatewayConnection,
	OnGatewayDisconnect,
	OnGatewayInit,
	SubscribeMessage,
	WebSocketGateway,
	WebSocketServer,
	WsResponse,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';

/**
 * Real-time connection (plain WebSocket on the API port, ws://host:PORT_API).
 * First stage: connect / disconnect + a "message" event. Chat and live notifications build on it.
 * Clients send JSON: { "event": "message", "data": ... }
 */
@WebSocketGateway({
	transports: ['websocket'],
	maxPayload: 64 * 1024, // one message is at most 64 KB: a client can't flood the server's memory
})
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private readonly logger = new Logger('SocketGateway');

	@WebSocketServer()
	private server: Server;

	public afterInit(): void {
		this.logger.log('WebSocket server initialized');
	}

	public handleConnection(): void {
		// the server's own set of open sockets: always right, unlike a hand-kept ++ / -- counter
		this.logger.log(`Client connected, total: ${this.server.clients.size}`);
	}

	public handleDisconnect(): void {
		this.logger.log(`Client disconnected, total: ${this.server.clients.size}`);
	}

	@SubscribeMessage('message')
	public handleMessage(_client: WebSocket, payload: unknown): WsResponse<string> {
		this.logger.log(`message: ${JSON.stringify(payload)?.slice(0, 100)}`);
		return { event: 'message', data: 'Hello world!' };
	}
}
