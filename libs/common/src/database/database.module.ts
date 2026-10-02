import { Logger, Module } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

const isProduction = () => process.env.NODE_ENV === 'production';

@Module({
	imports: [
		MongooseModule.forRootAsync({
			useFactory: () => {
				const key = isProduction() ? 'MONGO_PROD' : 'MONGO_DEV';
				const uri = process.env[key];
				if (!uri) throw new Error(`${key} is missing in .env`);
				return { uri };
			},
		}),
	],
	exports: [MongooseModule],
})
export class DatabaseModule {
	private readonly logger = new Logger('DatabaseModule');

	constructor(@InjectConnection() private readonly connection: Connection) {
		if (connection.readyState === ConnectionStates.connected) {
			this.logger.log(`MongoDB is connected into ${isProduction() ? 'production' : 'development'} db`);
		} else {
			this.logger.warn('MongoDB is not connected');
		}
	}
}
