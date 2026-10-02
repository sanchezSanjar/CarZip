import { Schema } from 'mongoose';
import {
	CarBrand,
	CarColor,
	CarCondition,
	CarFuelType,
	CarLocation,
	CarMarket,
	CarOption,
	CarStatus,
	CarTransmission,
	CarType,
} from '../enums/car.enum';
import { CAR_YEAR_MIN, carYearMax, isValidModel } from '../config/car-catalog';

const CarSchema = new Schema(
	{
		carType: { type: String, enum: CarType, required: true },
		carStatus: { type: String, enum: CarStatus, default: CarStatus.ACTIVE },
		carBrand: { type: String, enum: CarBrand, required: true },
		// picked from CAR_MODELS[carBrand]; free text only for brand OTHER
		carModel: {
			type: String,
			required: true,
			validate: {
				validator: function (this: { carBrand: CarBrand }, v: string) {
					return isValidModel(this.carBrand, v);
				},
				message: 'Model does not belong to this brand',
			},
		},
		carYear: { type: Number, required: true, min: CAR_YEAR_MIN, max: carYearMax() },
		carMileage: { type: Number, required: true, min: 0 },
		carColor: { type: String, enum: CarColor, required: true },
		carCondition: { type: String, enum: CarCondition, required: true },
		carFuelType: { type: String, enum: CarFuelType, required: true },
		carTransmission: { type: String, enum: CarTransmission, required: true },

		carLocation: { type: String, enum: CarLocation, required: true },
		carAddress: { type: String, required: true },
		carTitle: { type: String, required: true },
		// ---- market & prices. Dealer sets each price himself — we never convert KRW <-> USD.
		carMarket: { type: String, enum: CarMarket, default: CarMarket.DOMESTIC },
		carPrice: {
			// KRW. Required for DOMESTIC and BOTH, absent for EXPORT
			type: Number,
			min: 0,
			required: function (this: { carMarket: CarMarket }) {
				return this.carMarket !== CarMarket.EXPORT;
			},
		},
		carPriceUsd: {
			// USD. Required for EXPORT and BOTH, absent for DOMESTIC
			type: Number,
			min: 0,
			required: function (this: { carMarket: CarMarket }) {
				return this.carMarket !== CarMarket.DOMESTIC;
			},
		},
		// when the dealer accepted "export is fully the dealer's responsibility" for THIS listing
		carExportAgreedAt: {
			type: Date,
			required: function (this: { carMarket: CarMarket }) {
				return this.carMarket !== CarMarket.DOMESTIC;
			},
		},
		// per-day rent price; required only when the car is offered for rent
		carRentPrice: {
			type: Number,
			min: 0,
			required: function (this: { carRent: boolean }) {
				return this.carRent;
			},
		},
		carImages: { type: [String], required: true }, // URLs to object storage, never local files
		carDesc: { type: String },

		carOptions: { type: [String], enum: CarOption, default: [] }, // extra features
		carBarter: { type: Boolean, default: false },
		carRent: { type: Boolean, default: false },
		carTestDrive: { type: Boolean, default: false },

		carViews: { type: Number, default: 0 },
		carLikes: { type: Number, default: 0 },
		carComments: { type: Number, default: 0 },
		carRank: { type: Number, default: 0 },

		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' }, // always an AGENT

		// set only when an ADMIN put the car on HOLD: shown to the dealer, who can't re-activate it until an admin does
		carHoldReason: { type: String },
		// the dealer last said "this listing is current" (created, edited, re-activated or confirmed). NOT updatedAt:
		// views, likes and the nightly ranking change updatedAt without the dealer doing anything
		carConfirmedAt: { type: Date },
		staleRemindedAt: { type: Date }, // batch: last "is this car still for sale?" reminder
		soldAt: { type: Date },
		deletedAt: { type: Date },
	},
	{ timestamps: true, collection: 'cars' },
);

// keep data consistent with the market: no stray price, no rent on export-only cars
// (async + throw works in Mongoose 8 and 9; the old next() callback style was removed in 9)
CarSchema.pre('validate', async function () {
	if (this.carMarket === CarMarket.EXPORT) {
		this.set('carPrice', undefined);
		if (this.carRent) throw new Error('Export-only cars cannot be offered for rent');
	}
	if (this.carMarket === CarMarket.DOMESTIC) {
		this.set('carPriceUsd', undefined);
		this.set('carExportAgreedAt', undefined);
	}
});

// ---- sorting: one index per CarSort value (carStatus = ACTIVE is always in the query, _id breaks ties for the cursor)
CarSchema.index({ carStatus: 1, createdAt: -1, _id: -1 });
CarSchema.index({ carStatus: 1, carPrice: 1, _id: 1 });
CarSchema.index({ carStatus: 1, carPriceUsd: 1, _id: 1 });
CarSchema.index({ carStatus: 1, carMileage: 1, _id: 1 });
CarSchema.index({ carStatus: 1, carYear: -1, _id: -1 });
CarSchema.index({ carStatus: 1, carLikes: -1, _id: -1 });
CarSchema.index({ carStatus: 1, carViews: -1, _id: -1 });
CarSchema.index({ carStatus: 1, carRank: -1, _id: -1 });
// ---- filtering
CarSchema.index({ carStatus: 1, carBrand: 1, carModel: 1, carYear: -1 });
CarSchema.index({ carStatus: 1, carMarket: 1 });
CarSchema.index({ memberId: 1, carStatus: 1 }); // agent page / "my cars"
// batch: ACTIVE cars the dealer has not confirmed for a while
CarSchema.index({ carStatus: 1, carConfirmedAt: 1 });
CarSchema.index({ carOptions: 1 }); // multikey index for feature filter
// ---- keyword search
CarSchema.index({ carTitle: 'text', carModel: 'text', carDesc: 'text' });

export default CarSchema;
