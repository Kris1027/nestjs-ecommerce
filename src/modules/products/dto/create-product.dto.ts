import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { stripHtmlTags } from '../../../common/utils/sanitize.util';

const createProductSchema = z.object({
  name: z
    .string()
    .max(200, 'Name too long')
    .transform(stripHtmlTags)
    .pipe(z.string().min(2, 'Name must be at least 2 characters')),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(200, 'Slug too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only')
    .optional(),
  description: z.string().max(5000, 'Description too long').transform(stripHtmlTags).optional(),

  // Pricing - string input, transformed to number for Prisma Decimal
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid amount (e.g., 99.99)')
    .transform((val) => parseFloat(val)),
  comparePrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Compare price must be a valid amount')
    .transform((val) => parseFloat(val))
    .optional(),

  // Inventory
  sku: z.string().max(50, 'SKU too long').optional(),
  stock: z.number().int().min(0, 'Stock cannot be negative').default(0),

  // Relations
  categoryId: z.cuid('Invalid category ID'),

  // Images (array of URLs)
  images: z
    .array(
      z.object({
        url: z.url('Must be a valid URL'),
        alt: z.string().max(200, 'Alt text too long').transform(stripHtmlTags).optional(),
      }),
    )
    .optional(),

  // Status
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

export class CreateProductDto extends createZodDto(createProductSchema) {}
