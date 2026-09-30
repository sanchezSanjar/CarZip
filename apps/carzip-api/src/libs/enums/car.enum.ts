import { registerEnumType } from '@nestjs/graphql';

export enum CarType {
	SEDAN = 'SEDAN',
	SUV = 'SUV',
	HATCHBACK = 'HATCHBACK',
	COUPE = 'COUPE',
	CONVERTIBLE = 'CONVERTIBLE',
	VAN = 'VAN',
	TRUCK = 'TRUCK',
}
registerEnumType(CarType, { name: 'CarType' });

export enum CarStatus {
	HOLD = 'HOLD',
	ACTIVE = 'ACTIVE',
	SOLD = 'SOLD',
	DELETE = 'DELETE',
}
registerEnumType(CarStatus, { name: 'CarStatus' });

export enum CarBrand {
	// ordered by popularity on the Korean used-car market; the UI shows them in this order
	HYUNDAI = 'HYUNDAI',
	KIA = 'KIA',
	GENESIS = 'GENESIS',
	CHEVROLET = 'CHEVROLET',
	KGM = 'KGM',
	RENAULT = 'RENAULT',
	BMW = 'BMW',
	MERCEDES = 'MERCEDES',
	AUDI = 'AUDI',
	VOLKSWAGEN = 'VOLKSWAGEN',
	VOLVO = 'VOLVO',
	TESLA = 'TESLA',
	LEXUS = 'LEXUS',
	TOYOTA = 'TOYOTA',
	PORSCHE = 'PORSCHE',
	MINI = 'MINI',
	LAND_ROVER = 'LAND_ROVER',
	FORD = 'FORD',
	JEEP = 'JEEP',
	HONDA = 'HONDA',
	OTHER = 'OTHER',
}
registerEnumType(CarBrand, { name: 'CarBrand' });

export enum CarColor {
	// most common colors on Korean roads (흰색, 진주색, 검정, 쥐색, 은색 …)
	WHITE = 'WHITE',
	PEARL_WHITE = 'PEARL_WHITE',
	BLACK = 'BLACK',
	GRAY = 'GRAY',
	SILVER = 'SILVER',
	BLUE = 'BLUE',
	RED = 'RED',
	BROWN = 'BROWN',
	BEIGE = 'BEIGE',
	GREEN = 'GREEN',
	OTHER = 'OTHER',
}
registerEnumType(CarColor, { name: 'CarColor' });

export enum CarCondition {
	NEW = 'NEW',
	EXCELLENT = 'EXCELLENT',
	GOOD = 'GOOD',
	FAIR = 'FAIR',
	DAMAGED = 'DAMAGED',
}
registerEnumType(CarCondition, { name: 'CarCondition' });

export enum CarFuelType {
	GASOLINE = 'GASOLINE',
	DIESEL = 'DIESEL',
	LPG = 'LPG',
	HYBRID = 'HYBRID',
	PLUG_IN_HYBRID = 'PLUG_IN_HYBRID',
	ELECTRIC = 'ELECTRIC',
	HYDROGEN = 'HYDROGEN',
}
registerEnumType(CarFuelType, { name: 'CarFuelType' });

export enum CarTransmission {
	AUTOMATIC = 'AUTOMATIC',
	MANUAL = 'MANUAL',
}
registerEnumType(CarTransmission, { name: 'CarTransmission' });

/** Where the dealer is willing to sell the car. Decides which price(s) are required. */
export enum CarMarket {
	DOMESTIC = 'DOMESTIC', // Korea only -> price in KRW
	EXPORT = 'EXPORT', // export only -> price in USD
	BOTH = 'BOTH', // both -> KRW and USD, each set by the dealer
}
registerEnumType(CarMarket, { name: 'CarMarket' });

export enum CarLocation {
	SEOUL = 'SEOUL',
	BUSAN = 'BUSAN',
	INCHEON = 'INCHEON',
	DAEGU = 'DAEGU',
	GYEONGJU = 'GYEONGJU',
	GWANGJU = 'GWANGJU',
	CHONJU = 'CHONJU',
	DAEJON = 'DAEJON',
	JEJU = 'JEJU',
}
registerEnumType(CarLocation, { name: 'CarLocation' });

export enum CarOption {
	SUNROOF = 'SUNROOF',
	PANORAMIC_SUNROOF = 'PANORAMIC_SUNROOF',
	NAVIGATION = 'NAVIGATION',
	REAR_CAMERA = 'REAR_CAMERA',
	AROUND_VIEW = 'AROUND_VIEW',
	PARKING_SENSORS = 'PARKING_SENSORS',
	HEATED_SEATS = 'HEATED_SEATS',
	VENTILATED_SEATS = 'VENTILATED_SEATS',
	LEATHER_SEATS = 'LEATHER_SEATS',
	HEATED_STEERING = 'HEATED_STEERING',
	SMART_KEY = 'SMART_KEY',
	CRUISE_CONTROL = 'CRUISE_CONTROL',
	ADAPTIVE_CRUISE = 'ADAPTIVE_CRUISE',
	LANE_KEEP_ASSIST = 'LANE_KEEP_ASSIST',
	BLIND_SPOT_MONITOR = 'BLIND_SPOT_MONITOR',
	HEAD_UP_DISPLAY = 'HEAD_UP_DISPLAY',
	BLACK_BOX = 'BLACK_BOX', // dashcam
	HIPASS = 'HIPASS',
}
registerEnumType(CarOption, { name: 'CarOption' });

// what the list can be sorted by — an enum, so clients can never sort on an unindexed field
export enum CarSort {
	CREATED_AT = 'createdAt',
	PRICE = 'carPrice', // KRW
	PRICE_USD = 'carPriceUsd',
	MILEAGE = 'carMileage',
	YEAR = 'carYear',
	LIKES = 'carLikes',
	VIEWS = 'carViews',
}
registerEnumType(CarSort, { name: 'CarSort' });
