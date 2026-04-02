import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { stripHtmlTags } from '../../../common/utils/sanitize.util';

const updateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .max(100, 'Name too long')
    .transform(stripHtmlTags)
    .pipe(z.string().min(2, 'Name must be at least 2 characters'))
    .optional(),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100, 'Slug too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with hyphens only')
    .optional(),
  description: z.string().max(500, 'Description too long').transform(stripHtmlTags).nullish(),
  imageUrl: z.url('Must be a valid URL').nullish(),
  parentId: z.cuid('Invalid parent category ID').nullish(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(), // For soft delete/restore
});

export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {}
