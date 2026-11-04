import {
	BadRequestException,
	ForbiddenException,
	HttpException,
	HttpStatus,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthMemberData } from '../../libs/types/auth';
import {
	ChatCar,
	ChatPartner,
	Conversation,
	Conversations,
	PrivateMessage,
} from '../../libs/dto/conversation/conversation';
import {
	ConversationsInquiry,
	MessagesInquiry,
	SendMessageInput,
	StartConversationInput,
} from '../../libs/dto/conversation/conversation.input';
import { Message } from '@app/common/enums/common.enum';
import { MemberStatus, MemberType } from '@app/common/enums/member.enum';
import { MessageType } from '@app/common/enums/conversation.enum';
import { SocketGateway } from '../../socket/socket.gateway';
import { UploadService } from '../upload/upload.service';
import { UploadTarget } from '@app/common/enums/upload.enum';

// spam limit: at most 20 private messages per minute per member
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 20;

interface ConversationDoc {
	_id: Types.ObjectId;
	buyerId: Types.ObjectId;
	agentId: Types.ObjectId;
	carId?: Types.ObjectId;
	lastMessageText?: string;
	lastMessageType?: MessageType;
	lastSenderId?: Types.ObjectId;
	lastMessageAt: Date;
	buyerUnread: number;
	agentUnread: number;
	buyerReadAt?: Date;
	agentReadAt?: Date;
}

interface MessageDoc {
	_id: Types.ObjectId;
	conversationId: Types.ObjectId;
	senderId: Types.ObjectId;
	messageType: MessageType;
	messageText?: string;
	messageImage?: string;
	carId?: Types.ObjectId;
	createdAt: Date;
}

const PARTNER_FIELDS = 'memberNick memberImage memberType agentCompany memberStatus';
const CAR_FIELDS = 'carTitle carImages carPrice carPriceUsd carStatus memberId';

/**
 * Private messages between a buyer (USER) and a dealer (AGENT), like a messenger.
 * - a buyer can write to any ACTIVE dealer
 * - a dealer can start with a buyer who requested a test drive on one of their cars; after that both reply freely
 * - a dealer's personal block stops the conversation both ways
 * - messages and conversations are deleted 14 days after the last message (TTL indexes)
 * New messages and read receipts also go live over the WebSocket, only to the two members.
 */
@Injectable()
export class ConversationService {
	constructor(
		@InjectModel('Conversation') private readonly conversationModel: Model<ConversationDoc>,
		@InjectModel('PrivateMessage') private readonly messageModel: Model<MessageDoc>,
		@InjectModel('Member') private readonly memberModel: Model<{ memberType: MemberType; memberStatus: MemberStatus }>,
		@InjectModel('Block') private readonly blockModel: Model<{ blockerId: Types.ObjectId; blockedId: Types.ObjectId }>,
		@InjectModel('TestDrive')
		private readonly testDriveModel: Model<{ memberId: Types.ObjectId; sellerId: Types.ObjectId }>,
		@InjectModel('Car') private readonly carModel: Model<{ memberId: Types.ObjectId }>,
		private readonly socket: SocketGateway,
		private readonly uploadService: UploadService,
	) {}

	public async startConversation(me: AuthMemberData, input: StartConversationInput): Promise<Conversation> {
		const target = await this.memberModel.findById(new Types.ObjectId(input.targetId)).lean().exec();
		if (!target || target.memberStatus !== MemberStatus.ACTIVE)
			throw new NotFoundException(Message.CHAT_MEMBER_UNAVAILABLE);

		const pair = this.pairOf(me, target.memberType, new Types.ObjectId(input.targetId));
		await this.assertNotBlocked(pair.buyerId, pair.agentId);

		const existing = await this.conversationModel.findOne(pair).lean<ConversationDoc>().exec();
		// a dealer starts only with buyers who showed interest by requesting a test drive
		if (!existing && me.memberType === MemberType.AGENT) {
			const asked = await this.testDriveModel.exists({ memberId: pair.buyerId, sellerId: pair.agentId }).exec();
			if (!asked) throw new ForbiddenException(Message.CHAT_DEALER_NEEDS_TEST_DRIVE);
		}

		const carId = input.carId ? await this.assertDealerCar(input.carId, pair.agentId) : undefined;
		const conversation = await this.conversationModel
			.findOneAndUpdate(
				pair,
				{ $setOnInsert: { lastMessageAt: new Date() }, ...(carId && { $set: { carId } }) },
				{ upsert: true, new: true },
			)
			.lean<ConversationDoc>()
			.exec();
		return (await this.shape([conversation], me._id))[0];
	}

	public async getConversations(me: AuthMemberData, input: ConversationsInquiry): Promise<Conversations> {
		const filter = { $or: [{ buyerId: me._id }, { agentId: me._id }] };
		const [docs, total] = await Promise.all([
			this.conversationModel
				.find(filter)
				.sort({ lastMessageAt: -1 })
				.skip((input.page - 1) * input.limit)
				.limit(input.limit)
				.lean<ConversationDoc[]>()
				.exec(),
			this.conversationModel.countDocuments(filter).exec(),
		]);
		return { list: await this.shape(docs, me._id), total };
	}

	/** newest first; "before" pages back to older messages */
	public async getMessages(me: AuthMemberData, input: MessagesInquiry): Promise<PrivateMessage[]> {
		const conversation = await this.ownConversation(me, input.conversationId);
		const messages = await this.messageModel
			.find({ conversationId: conversation._id, ...(input.before && { createdAt: { $lt: input.before } }) })
			.sort({ createdAt: -1 })
			.limit(input.limit)
			.lean<MessageDoc[]>()
			.exec();
		return this.shapeMessages(messages);
	}

	public async sendMessage(me: AuthMemberData, input: SendMessageInput): Promise<PrivateMessage> {
		const conversation = await this.ownConversation(me, input.conversationId);
		const isBuyer = conversation.buyerId.equals(me._id);
		const partnerId = isBuyer ? conversation.agentId : conversation.buyerId;

		const partner = await this.memberModel.findById(partnerId).select('memberStatus').lean().exec();
		if (partner?.memberStatus !== MemberStatus.ACTIVE) throw new BadRequestException(Message.CHAT_MEMBER_UNAVAILABLE);
		await this.assertNotBlocked(conversation.buyerId, conversation.agentId);

		const recent = await this.messageModel
			.countDocuments({ senderId: me._id, createdAt: { $gte: new Date(Date.now() - RATE_WINDOW_MS) } })
			.exec();
		if (recent >= RATE_MAX) throw new HttpException(Message.CHAT_TOO_FAST, HttpStatus.TOO_MANY_REQUESTS);

		const carId = input.carId ? await this.assertDealerCar(input.carId, conversation.agentId) : undefined;
		const text = input.messageText?.trim() ?? '';
		const image = input.messageImage;
		if (!text && !image) throw new BadRequestException(Message.CHAT_EMPTY);
		// only photos our upload API produced for chats: no hot-linked or tracking images in private messages
		if (image && !this.uploadService.isUploadedImage(image, UploadTarget.CHAT)) {
			throw new BadRequestException(Message.CHAT_IMAGE_NOT_UPLOADED);
		}
		const messageType = image ? MessageType.IMAGE : MessageType.TEXT;

		const created = await this.messageModel.create({
			conversationId: conversation._id,
			senderId: me._id,
			messageType,
			...(text && { messageText: text }),
			...(image && { messageImage: image }),
			...(carId && { carId }),
		});
		const message = created.toObject() as MessageDoc;

		await this.conversationModel
			.updateOne(
				{ _id: conversation._id },
				{
					$set: {
						// the list shows a photo as "📷 Photo" (or its caption)
						lastMessageText: text || '📷 Photo',
						lastMessageType: messageType,
						lastSenderId: me._id,
						lastMessageAt: message.createdAt,
						...(carId && { carId }),
						// writing means the sender has read everything up to now
						[isBuyer ? 'buyerUnread' : 'agentUnread']: 0,
						[isBuyer ? 'buyerReadAt' : 'agentReadAt']: message.createdAt,
					},
					$inc: { [isBuyer ? 'agentUnread' : 'buyerUnread']: 1 },
				},
			)
			.exec();

		const [shaped] = await this.shapeMessages([message]);
		this.socket.sendToMembers([String(conversation.buyerId), String(conversation.agentId)], {
			event: 'privateMessage',
			conversationId: String(conversation._id),
			message: shaped,
		});
		return shaped;
	}

	/** I opened the thread: my unread count goes to 0, and the other side sees "read" */
	public async markConversationRead(me: AuthMemberData, conversationId: string): Promise<boolean> {
		const conversation = await this.ownConversation(me, conversationId);
		const isBuyer = conversation.buyerId.equals(me._id);
		const readAt = new Date();
		await this.conversationModel
			.updateOne(
				{ _id: conversation._id },
				{ $set: { [isBuyer ? 'buyerUnread' : 'agentUnread']: 0, [isBuyer ? 'buyerReadAt' : 'agentReadAt']: readAt } },
			)
			.exec();
		this.socket.sendToMembers([String(isBuyer ? conversation.agentId : conversation.buyerId)], {
			event: 'conversationRead',
			conversationId: String(conversation._id),
			readAt: readAt.toISOString(),
		});
		return true;
	}

	/** the number on the Chat tab: all my unread private messages */
	public async getUnreadMessageCount(me: AuthMemberData): Promise<number> {
		const [result] = await this.conversationModel
			.aggregate<{ total: number }>([
				{ $match: { $or: [{ buyerId: me._id }, { agentId: me._id }] } },
				{
					$group: {
						_id: null,
						total: { $sum: { $cond: [{ $eq: ['$buyerId', me._id] }, '$buyerUnread', '$agentUnread'] } },
					},
				},
			])
			.exec();
		return result?.total ?? 0;
	}

	/** buyer + dealer, whoever starts. Admins and same-role pairs are refused */
	private pairOf(me: AuthMemberData, targetType: MemberType, targetId: Types.ObjectId) {
		if (me.memberType === MemberType.USER && targetType === MemberType.AGENT)
			return { buyerId: me._id, agentId: targetId };
		if (me.memberType === MemberType.AGENT && targetType === MemberType.USER)
			return { buyerId: targetId, agentId: me._id };
		throw new ForbiddenException(Message.CHAT_BUYER_AND_DEALER);
	}

	private async assertNotBlocked(buyerId: Types.ObjectId, agentId: Types.ObjectId): Promise<void> {
		const blocked = await this.blockModel.exists({ blockerId: agentId, blockedId: buyerId }).exec();
		if (blocked) throw new ForbiddenException(Message.CHAT_BLOCKED);
	}

	private async assertDealerCar(carId: string, agentId: Types.ObjectId): Promise<Types.ObjectId> {
		const id = new Types.ObjectId(carId);
		const car = await this.carModel.findById(id).select('memberId').lean().exec();
		if (!car || !car.memberId.equals(agentId)) throw new BadRequestException(Message.CHAT_CAR_INVALID);
		return id;
	}

	/** the conversation, if the logged-in member is one of its two members (otherwise: not found, nothing revealed) */
	private async ownConversation(me: AuthMemberData, conversationId: string): Promise<ConversationDoc> {
		const conversation = await this.conversationModel
			.findOne({ _id: new Types.ObjectId(conversationId), $or: [{ buyerId: me._id }, { agentId: me._id }] })
			.lean<ConversationDoc>()
			.exec();
		if (!conversation) throw new NotFoundException(Message.NO_DATA_FOUND);
		return conversation;
	}

	/** conversations as "me" sees them: the partner's public profile, the car, my unread count */
	private async shape(docs: ConversationDoc[], meId: Types.ObjectId): Promise<Conversation[]> {
		const partnerIds = docs.map((doc) => (doc.buyerId.equals(meId) ? doc.agentId : doc.buyerId));
		const carIds = docs.map((doc) => doc.carId).filter(Boolean) as Types.ObjectId[];
		const [partners, cars] = await Promise.all([this.partnersById(partnerIds), this.carsById(carIds)]);

		return docs.map((doc) => {
			const isBuyer = doc.buyerId.equals(meId);
			const partnerId = isBuyer ? doc.agentId : doc.buyerId;
			return {
				_id: String(doc._id),
				buyerId: String(doc.buyerId),
				agentId: String(doc.agentId),
				partner: partners.get(String(partnerId)),
				carData: doc.carId ? cars.get(String(doc.carId)) : undefined,
				lastMessageText: doc.lastMessageText,
				lastMessageType: doc.lastMessageType,
				lastSenderId: doc.lastSenderId ? String(doc.lastSenderId) : undefined,
				lastMessageAt: doc.lastMessageAt,
				myUnread: (isBuyer ? doc.buyerUnread : doc.agentUnread) ?? 0,
				partnerReadAt: isBuyer ? doc.agentReadAt : doc.buyerReadAt,
			};
		});
	}

	private async shapeMessages(messages: MessageDoc[]): Promise<PrivateMessage[]> {
		const cars = await this.carsById(messages.map((message) => message.carId).filter(Boolean) as Types.ObjectId[]);
		return messages.map((message) => ({
			_id: String(message._id),
			conversationId: String(message.conversationId),
			senderId: String(message.senderId),
			messageType: message.messageType,
			messageText: message.messageText,
			messageImage: message.messageImage,
			carId: message.carId ? String(message.carId) : undefined,
			carData: message.carId ? cars.get(String(message.carId)) : undefined,
			createdAt: message.createdAt,
		}));
	}

	private async partnersById(ids: Types.ObjectId[]): Promise<Map<string, ChatPartner>> {
		if (!ids.length) return new Map();
		const members = await this.memberModel
			.find({ _id: { $in: ids } })
			.select(PARTNER_FIELDS)
			.lean<(ChatPartner & { _id: Types.ObjectId })[]>()
			.exec();
		return new Map(members.map((member) => [String(member._id), { ...member, _id: String(member._id) }]));
	}

	private async carsById(ids: Types.ObjectId[]): Promise<Map<string, ChatCar>> {
		if (!ids.length) return new Map();
		const cars = await this.carModel
			.find({ _id: { $in: ids } })
			.select(CAR_FIELDS)
			.lean<(ChatCar & { _id: Types.ObjectId })[]>()
			.exec();
		return new Map(cars.map((car) => [String(car._id), { ...car, _id: String(car._id) }]));
	}
}
