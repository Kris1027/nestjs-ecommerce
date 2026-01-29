import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const updateCategorySchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name too long')
    .optional(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100, 'Slug too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only')
    .optional(),
  description: z.string().max(500, 'Description too long').nullish(),
  imageUrl: z.url('Must be a valid URL').nullish(),
  parentId: z.cuid('Invalid parent category ID').nullish(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(), // For soft delete/restore
});

export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
