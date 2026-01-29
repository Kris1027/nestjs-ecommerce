import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const updateProductSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(200, 'Name too long')
    .optional(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(200, 'Slug too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only')
    .optional(),
  description: z.string().max(5000, 'Description too long').nullish(),

  // Pricing
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid amount (e.g., 99.99)')
    .transform((val) => parseFloat(val))
    .optional(),
  comparePrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Compare price must be a valid amount')
    .transform((val) => parseFloat(val))
    .nullish(),

  // Inventory
  sku: z.string().max(50, 'SKU too long').nullish(),
  stock: z.number().int().min(0, 'Stock cannot be negative').optional(),

  // Relations
  categoryId: z.cuid('Invalid category ID').optional(),

  // Status
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

export class UpdateProductDto extends createZodDto(updateProductSchema) {}
