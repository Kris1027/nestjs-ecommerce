import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import { type Role } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);
