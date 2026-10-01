import { Types } from 'mongoose';
import { ViewGroup } from '../../enums/view.enum';

/** server-side only (never sent by a client): the viewer always comes from the JWT */
export interface ViewInput {
	memberId: Types.ObjectId; // who viewed
	viewRefId: Types.ObjectId; // what was viewed
	viewGroup: ViewGroup;
}
