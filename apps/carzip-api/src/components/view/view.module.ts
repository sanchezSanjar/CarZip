import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ViewSchema from '@app/common/schemas/View.model';
import { ViewService } from './view.service';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'View', schema: ViewSchema }])],
	providers: [ViewService],
	exports: [ViewService], // member profiles now, cars and articles later
})
export class ViewModule {}
