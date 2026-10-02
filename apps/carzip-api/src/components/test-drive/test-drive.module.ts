import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import TestDriveSchema from '../../schemas/TestDrive.model';
import CarSchema from '../../schemas/Car.model';
import BlockSchema from '../../schemas/Block.model';
import { TestDriveResolver } from './test-drive.resolver';
import { TestDriveService } from './test-drive.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
	imports: [
		// read directly: CarModule imports this module, so this one can't import CarModule back
		MongooseModule.forFeature([
			{ name: 'TestDrive', schema: TestDriveSchema },
			{ name: 'Car', schema: CarSchema }, // is the car on sale with test drives on? who sells it?
			{ name: 'Block', schema: BlockSchema }, // personal blocks stop requests
		]),
		AuthModule, // guards
		NotificationModule, // TEST_DRIVE notifications
	],
	providers: [TestDriveResolver, TestDriveService],
	exports: [TestDriveService], // car status changes and admin blocks cancel open test drives
})
export class TestDriveModule {}
