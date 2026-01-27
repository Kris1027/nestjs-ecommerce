import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const adminUpdateUserSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name cannot be empty')
    .max(50, 'First name too long')
    .optional(),
  lastName: z.string().min(1, 'Last name cannot be empty').max(50, 'Last name too long').optional(),
  role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
});

export class AdminUpdateUserDto extends createZodDto(adminUpdateUserSchema) {}
