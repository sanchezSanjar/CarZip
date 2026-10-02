import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import LikeSchema from '@app/common/schemas/Like.model';
import { LikeService } from './like.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Like', schema: LikeSchema }])],
	providers: [LikeService],
	exports: [LikeService], // member, car and board-article modules toggle and read likes through it
})
export class LikeModule {}
