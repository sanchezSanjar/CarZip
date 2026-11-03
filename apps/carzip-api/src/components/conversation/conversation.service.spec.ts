import { describe, it, expect, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { ConversationService } from './conversation.service';
import { Message } from '@app/common/enums/common.enum';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';

// a mongoose call chain: .select() / .lean() / .sort() ... can be chained, .exec() gives the value
const query = (value: unknown) => {
	const chain: Record<string, unknown> = { exec: async () => value };
	for (const step of ['select', 'lean', 'sort', 'skip', 'limit']) chain[step] = () => chain;
	return chain;
};

const buyer = {
	_id: new Types.ObjectId(),
	memberNick: 'cz_buyer',
	memberType: MemberType.USER,
	memberStatus: MemberStatus.ACTIVE,
};
const dealer = {
	_id: new Types.ObjectId(),
	memberNick: 'dealer',
	memberType: MemberType.AGENT,
	memberStatus: MemberStatus.ACTIVE,
};
const otherBuyer = {
	_id: new Types.ObjectId(),
	memberNick: 'other',
	memberType: MemberType.USER,
	memberStatus: MemberStatus.ACTIVE,
};
const admin = {
	_id: new Types.ObjectId(),
	memberNick: 'admin',
	memberType: MemberType.ADMIN,
	memberStatus: MemberStatus.ACTIVE,
};
const members = [buyer, dealer, otherBuyer, admin];

/** the service with fake models; the conversation between buyer and dealer exists when `existing` */
function setup({ existing = false, testDrive = false, blocked = false, recentMessages = 0 } = {}) {
	const conversation = {
		_id: new Types.ObjectId(),
		buyerId: buyer._id,
		agentId: dealer._id,
		lastMessageAt: new Date(),
		buyerUnread: 0,
		agentUnread: 0,
	};
	const conversationModel = {
		findOne: vi.fn((filter: Record<string, unknown>) => {
			const mine =
				!filter.$or ||
				(filter.$or as { buyerId?: unknown; agentId?: unknown }[]).some(
					(side) =>
						String(side.buyerId ?? side.agentId) === String(buyer._id) ||
						String(side.buyerId ?? side.agentId) === String(dealer._id),
				);
			return query(existing && mine ? conversation : null);
		}),
		findOneAndUpdate: vi.fn(() => query(conversation)),
		updateOne: vi.fn(() => query({})),
	};
	const created: Record<string, unknown>[] = [];
	const messageModel = {
		countDocuments: vi.fn(() => query(recentMessages)),
		create: vi.fn(async (doc: Record<string, unknown>) => {
			const saved = { ...doc, _id: new Types.ObjectId(), createdAt: new Date() };
			created.push(saved);
			return { toObject: () => saved };
		}),
	};
	const memberModel = {
		findById: vi.fn((id: Types.ObjectId) => query(members.find((m) => m._id.equals(id)) ?? null)),
		find: vi.fn(() => query(members)),
	};
	const socket = { sendToMembers: vi.fn() };
	const service = new ConversationService(
		conversationModel as never,
		messageModel as never,
		memberModel as never,
		{ exists: vi.fn(() => query(blocked ? { _id: 'b' } : null)) } as never,
		{ exists: vi.fn(() => query(testDrive ? { _id: 't' } : null)) } as never,
		{ findById: vi.fn(() => query(null)), find: vi.fn(() => query([])) } as never,
		socket as never,
	);
	return { service, conversation, conversationModel, messageModel, created, socket };
}

const start = (service: ConversationService, me: typeof buyer, target: typeof buyer) =>
	service.startConversation(me as never, { targetId: String(target._id) });

describe('ConversationService: who may start a conversation', () => {
	it('a buyer can write to any dealer, without a test drive', async () => {
		const { service, conversationModel } = setup();
		const conversation = await start(service, buyer, dealer);
		expect(conversation.partner?.memberNick).toBe('dealer');
		expect(conversationModel.findOneAndUpdate).toHaveBeenCalledWith(
			{ buyerId: buyer._id, agentId: dealer._id },
			expect.anything(),
			expect.objectContaining({ upsert: true }),
		);
	});

	it('a dealer can start only with a buyer who requested a test drive on their cars', async () => {
		await expect(start(setup().service, dealer, buyer)).rejects.toThrow(Message.CHAT_DEALER_NEEDS_TEST_DRIVE);
		await expect(start(setup({ testDrive: true }).service, dealer, buyer)).resolves.toBeTruthy();
	});

	it('a dealer can always reply in an existing conversation', async () => {
		await expect(start(setup({ existing: true }).service, dealer, buyer)).resolves.toBeTruthy();
	});

	it('buyer to buyer and admins are refused: messages are between a buyer and a dealer', async () => {
		await expect(start(setup().service, buyer, otherBuyer)).rejects.toThrow(Message.CHAT_BUYER_AND_DEALER);
		await expect(start(setup().service, admin, dealer)).rejects.toThrow(Message.CHAT_BUYER_AND_DEALER);
	});

	it("a dealer's personal block stops the conversation", async () => {
		await expect(start(setup({ blocked: true }).service, buyer, dealer)).rejects.toThrow(Message.CHAT_BLOCKED);
	});
});

describe('ConversationService: messages', () => {
	const send = (
		service: ConversationService,
		me: typeof buyer,
		conversationId: Types.ObjectId,
		text = 'Is a discount possible?',
	) => service.sendMessage(me as never, { conversationId: String(conversationId), messageText: text });

	it('a message is saved, counted as unread for the other side and sent live to both members only', async () => {
		const { service, conversation, conversationModel, created, socket } = setup({ existing: true });
		const message = await send(service, buyer, conversation._id);
		expect(created).toHaveLength(1);
		expect(message.messageText).toBe('Is a discount possible?');
		expect(conversationModel.updateOne).toHaveBeenCalledWith(
			{ _id: conversation._id },
			expect.objectContaining({ $inc: { agentUnread: 1 } }),
		);
		expect(socket.sendToMembers).toHaveBeenCalledWith(
			[String(buyer._id), String(dealer._id)],
			expect.objectContaining({ event: 'privateMessage' }),
		);
	});

	it('someone outside the conversation gets "not found" and nothing is saved', async () => {
		const { service, conversation, created } = setup({ existing: true });
		await expect(send(service, otherBuyer, conversation._id)).rejects.toThrow(Message.NO_DATA_FOUND);
		expect(created).toHaveLength(0);
	});

	it('more than 20 messages a minute are refused', async () => {
		const { service, conversation } = setup({ existing: true, recentMessages: 20 });
		const error = await send(service, buyer, conversation._id).catch((e: unknown) => e);
		expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
	});

	it('opening the thread clears my unread count and tells the other side it was read', async () => {
		const { service, conversation, conversationModel, socket } = setup({ existing: true });
		await service.markConversationRead(dealer as never, String(conversation._id));
		expect(conversationModel.updateOne).toHaveBeenCalledWith(
			{ _id: conversation._id },
			{ $set: expect.objectContaining({ agentUnread: 0 }) },
		);
		expect(socket.sendToMembers).toHaveBeenCalledWith(
			[String(buyer._id)],
			expect.objectContaining({ event: 'conversationRead' }),
		);
	});
});
