import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import NoticeSchema from '@app/common/schemas/Notice.model';
import { NoticeResolver } from './notice.resolver';
import { NoticeService } from './notice.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Notice', schema: NoticeSchema }]), AuthModule],
	providers: [NoticeResolver, NoticeService],
})
export class NoticeModule {}
