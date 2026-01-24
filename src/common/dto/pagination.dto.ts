import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Pagination query parameters schema
// Supports both offset-based and cursor-based pagination
export const PaginationQuerySchema = z.object({
  // Offset-based pagination
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().positive()),

  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .pipe(z.number().int().min(1).max(100)),

  // Cursor-based pagination (for infinite scroll)
  cursor: z.string().optional(),

  // Sorting
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// DTO for use in controllers with @Query()
export class PaginationQueryDto extends createZodDto(PaginationQuerySchema) {}

// TypeScript type for use in services
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
