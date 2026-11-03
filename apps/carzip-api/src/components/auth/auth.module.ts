import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import MemberSchema from '@app/common/schemas/Member.model';
import RefreshTokenSchema from '@app/common/schemas/RefreshToken.model';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';

@Module({
	imports: [
		MongooseModule.forFeature([
			// guards check the member's current status and role in the DB, not only the token
			{ name: 'Member', schema: MemberSchema },
			{ name: 'RefreshToken', schema: RefreshTokenSchema }, // sessions of devices that logged in with a device
		]),
		// registerAsync: read SECRET_TOKEN when the app starts, after ConfigModule has loaded .env.
		// JwtModule.register({ secret: process.env.SECRET_TOKEN }) would run at import time and get undefined.
		JwtModule.registerAsync({
			useFactory: () => {
				const secret = process.env.SECRET_TOKEN;
				if (!secret) throw new Error('SECRET_TOKEN is missing in .env');
				// 30 days: login without a device. Login with a device gets 15 minutes (AuthService.createToken)
				return { secret, signOptions: { expiresIn: '30d' } };
			},
		}),
	],
	providers: [AuthService, AuthResolver],
	exports: [AuthService],
})
export class AuthModule {}
