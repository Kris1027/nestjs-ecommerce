import { createZodDto } from 'nestjs-zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';
import { z } from 'zod';

const inventoryQuerySchema = PaginationQuerySchema.extend({
  filter: z.enum(['all', 'low-stock']).optional().default('all'),
});

export class InventoryQueryDto extends createZodDto(inventoryQuerySchema) {}

export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
