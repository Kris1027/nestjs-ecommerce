import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const createCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100, 'Slug too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only')
    .optional(), // Auto-generated from name if not provided
  description: z.string().max(500, 'Description too long').optional(),
  imageUrl: z.url('Must be a valid URL').optional(),
  parentId: z.cuid('Invalid parent category ID').optional(),
  sortOrder: z.number().int().min(0).default(0),
});

export class CreateCategoryDto extends createZodDto(createCategorySchema) {}
