import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { PaginationQuerySchema } from '../../../common/dto/pagination.dto';

// Extend shared pagination with notification-specific filters
const notificationQuerySchema = PaginationQuerySchema.extend({
  // Filter by read/unread status (e.g., "show only unread")
  // Query params arrive as strings, so we transform "true"/"false" to boolean
  isRead: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),

  // Filter by notification type (e.g., "show only ORDER_CREATED")
  type: z
    .enum([
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_SHIPPED',
      'ORDER_DELIVERED',
      'ORDER_CANCELLED',
      'PAYMENT_SUCCEEDED',
      'PAYMENT_FAILED',
      'REFUND_INITIATED',
      'REFUND_COMPLETED',
      'REFUND_FAILED',
      'REFUND_REQUEST_CREATED',
      'REVIEW_CREATED',
      'LOW_STOCK',
      'WELCOME',
      'PASSWORD_CHANGED',
    ])
    .optional(),
});

// DTO class for controller @Query() decorator — triggers ZodValidationPipe
export class NotificationQueryDto extends createZodDto(notificationQuerySchema) {}

// Inferred type for service method signatures
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;
