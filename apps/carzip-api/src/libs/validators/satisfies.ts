import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Cross-field rule on one property: @Satisfies((dto, value) => boolean, 'message')
 * Used where a field's validity depends on another field (model vs brand, rent vs market).
 */
export function Satisfies<T>(rule: (dto: T, value: any) => boolean, message: string, options?: ValidationOptions) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'satisfies',
			target: object.constructor,
			propertyName,
			options: { message, ...options },
			validator: {
				validate(value: any, args: ValidationArguments) {
					return rule(args.object as T, value);
				},
			},
		});
	};
}
