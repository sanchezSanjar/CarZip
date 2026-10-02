import { SetMetadata } from '@nestjs/common';
import { MemberType } from '@app/common/enums/member.enum';

export const ROLES_KEY = 'roles';

/** which member types may call the handler. Checked by RolesGuard. */
export const Roles = (...roles: MemberType[]) => SetMetadata(ROLES_KEY, roles);
