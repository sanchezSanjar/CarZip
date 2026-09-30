import { registerEnumType } from '@nestjs/graphql';

export enum TestDriveStatus {
	REQUEST = 'REQUEST',
	CONFIRM = 'CONFIRM',
	REJECT = 'REJECT',
	CANCEL = 'CANCEL',
	COMPLETE = 'COMPLETE',
}
registerEnumType(TestDriveStatus, { name: 'TestDriveStatus' });
