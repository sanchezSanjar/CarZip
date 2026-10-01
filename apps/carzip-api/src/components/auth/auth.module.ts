import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Module({
	imports: [
		// registerAsync: read SECRET_TOKEN when the app starts, after ConfigModule has loaded .env.
		// JwtModule.register({ secret: process.env.SECRET_TOKEN }) would run at import time and get undefined.
		JwtModule.registerAsync({
			useFactory: () => {
				const secret = process.env.SECRET_TOKEN;
				if (!secret) throw new Error('SECRET_TOKEN is missing in .env');
				return { secret, signOptions: { expiresIn: '30d' } };
			},
		}),
	],
	providers: [AuthService],
	exports: [AuthService],
})
export class AuthModule {}
