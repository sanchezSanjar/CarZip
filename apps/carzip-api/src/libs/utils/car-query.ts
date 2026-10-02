import { BadRequestException } from '@nestjs/common';
import { PipelineStage, Types } from 'mongoose';
import { CarMarket, CarSort, CarStatus } from '../enums/car.enum';
import { Direction } from '../enums/common.enum';
import { CarsInquiry, NumberRange, OrdinaryInquiry } from '../dto/car/car.input';
import { lookupAuthMemberLiked, lookupPublicMember } from './lookup';

// s / d: the sort the cursor was made for. A cursor only makes sense for that same sort:
// "after price 21,000,000" means nothing when the list is sorted by newest.
type Cursor = { v: string | number; id: string; s: CarSort; d: Direction };

export function encodeCursor(sortField: CarSort, direction: Direction, doc: Record<string, any>): string {
	const raw = doc[sortField];
	const v = raw instanceof Date ? raw.toISOString() : raw;
	const cursor: Cursor = { v, id: String(doc._id), s: sortField, d: direction };
	return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(
	cursor: string,
	sortField: CarSort,
	direction: Direction,
): { v: Date | number; id: Types.ObjectId } {
	let c: Cursor;
	let v: Date | number;
	let id: Types.ObjectId;
	try {
		c = JSON.parse(Buffer.from(cursor, 'base64url').toString());
		v = sortField === CarSort.CREATED_AT ? new Date(c.v) : Number(c.v);
		id = new Types.ObjectId(c.id);
	} catch {
		throw new BadRequestException('Invalid cursor');
	}
	if (c.s !== sortField || c.d !== direction) {
		throw new BadRequestException('This cursor belongs to another sort order. Start again without a cursor.');
	}
	if (typeof v === 'number' ? Number.isNaN(v) : Number.isNaN(v.getTime()))
		throw new BadRequestException('Invalid cursor');
	return { v, id };
}

function range(r?: NumberRange) {
	if (!r || (r.start === undefined && r.end === undefined)) return undefined;
	const q: Record<string, number> = {};
	if (r.start !== undefined) q.$gte = r.start;
	if (r.end !== undefined) q.$lte = r.end;
	return q;
}

/** the car's agent as agentData, PUBLIC fields only (see libs/utils/lookup.ts) */
export const lookupAgentData = lookupPublicMember('agentData');

/**
 * "My favorites" / "Recently viewed": the member's rows (likes, views) that point at cars -> one page of those cars.
 * Run it after $match + $sort on the rows. Only cars people may see (ACTIVE, SOLD) are kept:
 * held / deleted cars drop out of the list AND of the total. Each car gets its agent's public data and meLiked.
 */
export const refsToCarsPage = (refField: string, memberId: Types.ObjectId, input: OrdinaryInquiry): PipelineStage[] => [
	{
		$lookup: {
			from: 'cars',
			localField: refField,
			foreignField: '_id',
			as: 'refCar',
			pipeline: [{ $match: { carStatus: { $in: [CarStatus.ACTIVE, CarStatus.SOLD] } } }],
		},
	},
	{ $unwind: '$refCar' }, // a held / deleted car: no match, the row disappears
	{
		$facet: {
			list: [
				{ $skip: (input.page - 1) * input.limit },
				{ $limit: input.limit },
				{ $replaceRoot: { newRoot: '$refCar' } },
				lookupAuthMemberLiked(memberId),
				...lookupAgentData,
			],
			metaCounter: [{ $count: 'total' }],
		},
	},
];

/** Builds the full aggregation for getCars. Service calls: model.aggregate(pipeline), then toPage(). */
/** viewerId: the logged-in member (fills meLiked for each car), undefined for guests */
export function buildCarsPipeline(input: CarsInquiry, viewerId?: Types.ObjectId): PipelineStage[] {
	const sortField = input.sort ?? CarSort.CREATED_AT;
	const dir = input.direction ?? Direction.DESC;
	const s = input.search ?? {};

	const match: Record<string, any> = { carStatus: CarStatus.ACTIVE }; // public list = ACTIVE only
	if (s.text) match.$text = { $search: s.text }; // must be in the FIRST $match stage
	if (s.agentId) match.memberId = new Types.ObjectId(s.agentId);
	if (s.brandList?.length) match.carBrand = { $in: s.brandList };
	if (s.modelList?.length) match.carModel = { $in: s.modelList };
	if (s.typeList?.length) match.carType = { $in: s.typeList };
	if (s.colorList?.length) match.carColor = { $in: s.colorList };
	if (s.locationList?.length) match.carLocation = { $in: s.locationList };
	if (s.conditionList?.length) match.carCondition = { $in: s.conditionList };
	if (s.fuelList?.length) match.carFuelType = { $in: s.fuelList };
	if (s.transmissionList?.length) match.carTransmission = { $in: s.transmissionList };
	if (s.optionList?.length) match.carOptions = { $all: s.optionList };
	if (s.market === CarMarket.DOMESTIC) match.carMarket = { $in: [CarMarket.DOMESTIC, CarMarket.BOTH] };
	if (s.market === CarMarket.EXPORT) match.carMarket = { $in: [CarMarket.EXPORT, CarMarket.BOTH] };
	if (s.market === CarMarket.BOTH) match.carMarket = CarMarket.BOTH;
	if (range(s.priceRange)) match.carPrice = range(s.priceRange);
	if (range(s.priceUsdRange)) match.carPriceUsd = range(s.priceUsdRange);
	if (range(s.mileageRange)) match.carMileage = range(s.mileageRange);
	if (range(s.yearRange)) match.carYear = range(s.yearRange);
	if (s.barter) match.carBarter = true;
	if (s.rent) match.carRent = true;
	if (s.testDrive) match.carTestDrive = true;

	// Sorting by a price means comparing cars that HAVE that price. Otherwise export-only cars
	// (no KRW price) would all sit at the top of "lowest KRW price" as if they were free.
	if (sortField === CarSort.PRICE) match.carPrice = { ...(match.carPrice ?? {}), $exists: true };
	if (sortField === CarSort.PRICE_USD) match.carPriceUsd = { ...(match.carPriceUsd ?? {}), $exists: true };

	// cursor: continue after the last car of the previous page. _id breaks ties
	// (many cars have the same likes / price), otherwise cars get skipped or repeated.
	if (input.cursor) {
		const c = decodeCursor(input.cursor, sortField, dir);
		const op = dir === Direction.DESC ? '$lt' : '$gt';
		match.$or = [{ [sortField]: { [op]: c.v } }, { [sortField]: c.v, _id: { [op]: c.id } }];
	}

	return [
		{ $match: match },
		{ $sort: { [sortField]: dir, _id: dir } },
		{ $limit: input.limit + 1 }, // +1 tells us whether a next page exists
		...(viewerId ? [lookupAuthMemberLiked(viewerId)] : []), // "did I like it?" per car, one query
		...lookupAgentData,
	];
}

export function toPage<T extends Record<string, any>>(docs: T[], input: CarsInquiry) {
	const hasMore = docs.length > input.limit;
	const list = hasMore ? docs.slice(0, input.limit) : docs;
	const sortField = input.sort ?? CarSort.CREATED_AT;
	const direction = input.direction ?? Direction.DESC;
	return { list, nextCursor: hasMore ? encodeCursor(sortField, direction, list[list.length - 1]) : null };
}
