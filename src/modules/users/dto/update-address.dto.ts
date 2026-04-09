import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const updateAddressSchema = z.object({
  type: z.enum(['SHIPPING', 'BILLING']).optional(),
  isDefault: z.boolean().optional(),
  fullName: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name too long')
    .optional(),
  phone: z
    .string()
    .regex(/^(\+48)?\d{9}$/, 'Phone must be 9 digits, optionally prefixed with +48')
    .optional(),
  street: z
    .string()
    .min(3, 'Street address must be at least 3 characters')
    .max(200, 'Street address too long')
    .optional(),
  city: z
    .string()
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City too long')
    .optional(),
  region: z.string().max(100, 'Region too long').nullish(),
  postalCode: z
    .string()
    .regex(/^\d{2}-\d{3}$/, 'Postal code must be in XX-XXX format (e.g. 00-001)')
    .optional(),
  country: z.string().length(2, 'Country must be a 2-letter ISO code').optional(),
});

export class UpdateAddressDto extends createZodDto(updateAddressSchema) {}
