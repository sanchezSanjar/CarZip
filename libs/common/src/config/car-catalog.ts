import { CarBrand } from '../enums/car.enum';

/**
 * Popular models per brand on the Korean used-car market.
 * Dealers PICK from this list (like the Karrot / Encar car form), so filters and search always match.
 * Only brand OTHER allows a free-text model.
 * Adding a model = add a string here and deploy. Never rename an existing string: cars in the DB use it.
 */
export const CAR_MODELS: Record<CarBrand, string[]> = {
	[CarBrand.HYUNDAI]: [
		'Avante',
		'Sonata',
		'Grandeur',
		'Casper',
		'Venue',
		'Kona',
		'Tucson',
		'Santa Fe',
		'Palisade',
		'Staria',
		'Porter',
		'Ioniq 5',
		'Ioniq 6',
		'Nexo',
	],
	[CarBrand.KIA]: [
		'Morning',
		'Ray',
		'K3',
		'K5',
		'K8',
		'K9',
		'Niro',
		'Seltos',
		'Sportage',
		'Sorento',
		'Mohave',
		'Carnival',
		'EV6',
		'EV9',
		'Bongo',
	],
	[CarBrand.GENESIS]: ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
	[CarBrand.CHEVROLET]: ['Spark', 'Malibu', 'Trax', 'Trailblazer', 'Equinox', 'Traverse', 'Colorado', 'Bolt EV'],
	[CarBrand.KGM]: ['Tivoli', 'Korando', 'Torres', 'Rexton', 'Rexton Sports'],
	[CarBrand.RENAULT]: ['SM6', 'QM6', 'XM3 / Arkana', 'Grand Koleos'],
	[CarBrand.BMW]: ['1 Series', '3 Series', '5 Series', '7 Series', 'X3', 'X5', 'X7', 'i4', 'iX'],
	[CarBrand.MERCEDES]: ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'GLS', 'EQE'],
	[CarBrand.AUDI]: ['A4', 'A6', 'A8', 'Q5', 'Q7', 'e-tron'],
	[CarBrand.VOLKSWAGEN]: ['Golf', 'Jetta', 'Passat', 'Tiguan', 'Touareg', 'ID.4'],
	[CarBrand.VOLVO]: ['S60', 'S90', 'XC40', 'XC60', 'XC90'],
	[CarBrand.TESLA]: ['Model 3', 'Model Y', 'Model S', 'Model X'],
	[CarBrand.LEXUS]: ['ES', 'NX', 'RX', 'LS'],
	[CarBrand.TOYOTA]: ['Camry', 'RAV4', 'Prius', 'Sienna'],
	[CarBrand.PORSCHE]: ['911', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
	[CarBrand.MINI]: ['Cooper', 'Countryman', 'Clubman'],
	[CarBrand.LAND_ROVER]: ['Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Discovery', 'Defender'],
	[CarBrand.FORD]: ['Explorer', 'Mustang', 'Bronco'],
	[CarBrand.JEEP]: ['Wrangler', 'Grand Cherokee', 'Compass'],
	[CarBrand.HONDA]: ['Accord', 'CR-V', 'Odyssey'],
	[CarBrand.OTHER]: [], // free text allowed
};

export const CAR_YEAR_MIN = 1990;
export const carYearMax = () => new Date().getFullYear() + 1;

export function isValidModel(brand: CarBrand, model: string): boolean {
	if (!model || !model.trim()) return false;
	if (brand === CarBrand.OTHER) return model.trim().length <= 50;
	return CAR_MODELS[brand]?.includes(model) ?? false;
}
