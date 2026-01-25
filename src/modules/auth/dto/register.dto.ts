import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.email('Invalid email format').transform((v) => v.toLowerCase().trim()),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must not exceed 72 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain uppercase, lowercase, and number',
    ),

  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name too long')
    .trim()
    .optional(),

  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name too long')
    .trim()
    .optional(),
});

export class RegisterDto extends createZodDto(registerSchema) {}
