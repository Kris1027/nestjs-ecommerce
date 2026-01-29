import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';

// Extend pagination with product-specific filters
const productQuerySchema = PaginationQuerySchema.extend({
  // Filters
  categoryId: z.string().optional(),
  search: z.string().max(100).optional(),
  minPrice: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(0))
    .optional(),
  maxPrice: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().min(0))
    .optional(),
  isFeatured: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
});

export class ProductQueryDto extends createZodDto(productQuerySchema) {}

export type ProductQuery = z.infer<typeof productQuerySchema>;
