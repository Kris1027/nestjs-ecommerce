import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const adjustStockSchema = z.object({
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .refine((val) => val !== 0, 'Quantity cannot be zero'),
  type: z.enum(['ADJUSTMENT', 'RESTOCK', 'RETURN']),
  reason: z.string().max(500).optional(),
});

export class AdjustStockDto extends createZodDto(adjustStockSchema) {}
