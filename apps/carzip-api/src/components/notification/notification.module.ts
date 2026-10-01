import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import NotificationSchema from '../../schemas/Notification.model';
import MemberSchema from '../../schemas/Member.model';
import { NotificationService } from './notification.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: 'Notification', schema: NotificationSchema },
			{ name: 'Member', schema: MemberSchema }, // to find the admins
		]),
	],
	providers: [NotificationService],
	exports: [NotificationService],
})
export class NotificationModule {}
