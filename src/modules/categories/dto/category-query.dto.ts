import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';

const isActiveSchema = z
  .string()
  .default('true')
  .transform((val) => {
    if (val === 'all') {
      return undefined;
    }
    return val === 'true';
  });

const categoryQuerySchema = PaginationQuerySchema.extend({
  isActive: isActiveSchema,
});

export class CategoryQueryDto extends createZodDto(categoryQuerySchema) {}

export type CategoryQuery = z.infer<typeof categoryQuerySchema>;
