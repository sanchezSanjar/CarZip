import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import PushTokenSchema from '../schemas/PushToken.model';
import { PushService } from './push.service';

/** push notifications to the members' phones, for the API and the batch server */
@Global()
@Module({
	imports: [MongooseModule.forFeature([{ name: 'PushToken', schema: PushTokenSchema }])],
	providers: [PushService],
	exports: [PushService],
})
export class PushModule {}
