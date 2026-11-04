import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { LikeService } from './like.service';

describe('LikeService.meLikedAfter: the heart after a toggle', () => {
	const service = Object.create(LikeService.prototype) as LikeService;
	const memberId = new Types.ObjectId();
	const carId = new Types.ObjectId();

	it('liked now (or already liked by a parallel tap): one entry with myFavorite', () => {
		for (const modifier of [1, 0] as const) {
			expect(service.meLikedAfter(memberId, carId, modifier)).toEqual([
				{ memberId: String(memberId), likeRefId: String(carId), myFavorite: true },
			]);
		}
	});

	it('un-liked: empty, so the heart turns off', () => {
		expect(service.meLikedAfter(memberId, carId, -1)).toEqual([]);
	});
});
