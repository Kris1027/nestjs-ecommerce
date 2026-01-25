import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.email('Invalid email format').transform((v) => v.toLowerCase().trim()),

  password: z.string().min(1, 'Password is required'),
});

export class LoginDto extends createZodDto(loginSchema) {}
