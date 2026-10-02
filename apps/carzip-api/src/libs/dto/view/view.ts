import { Field, ObjectType } from '@nestjs/graphql';
import { ViewGroup } from '@app/common/enums/view.enum';

/** one member viewed one item (member profile, car, article) — at most once, see View.model.ts */
@ObjectType()
export class View {
	@Field(() => String) _id: string;
	@Field(() => ViewGroup) viewGroup: ViewGroup;
	@Field(() => String) viewRefId: string;
	@Field(() => String) memberId: string;
	@Field(() => Date) createdAt: Date;
	@Field(() => Date) updatedAt: Date;
}
