import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Zod 4 syntax: use z.email(), z.string() directly
export const CreateUserSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name must not be empty').optional(),
  lastName: z.string().min(1, 'Last name must not be empty').optional(),
});

// Create a DTO class from the schema
export class CreateUserDto extends createZodDto(CreateUserSchema) {}

// Infer TypeScript type from schema (for use in services)
export type CreateUser = z.infer<typeof CreateUserSchema>;
