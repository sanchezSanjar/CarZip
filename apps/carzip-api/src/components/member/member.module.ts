import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '../../schemas/Member.model';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';
import { AuthModule } from '../auth/auth.module';
import { OtpModule } from '../otp/otp.module';
import { ViewModule } from '../view/view.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]), AuthModule, OtpModule, ViewModule],
	providers: [MemberResolver, MemberService],
})
export class MemberModule {}
