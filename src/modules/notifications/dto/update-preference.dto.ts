import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// Schema for updating a single notification preference
const updatePreferenceSchema = z.object({
  // Which notification type to configure (must match NotificationType enum)
  type: z.enum([
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
  ]),

  // Which delivery channel to configure
  channel: z.enum(['IN_APP', 'EMAIL']),

  // Enable or disable this type+channel combination
  enabled: z.boolean(),
});

// DTO class for controller @Body() decorator — triggers ZodValidationPipe
export class UpdatePreferenceDto extends createZodDto(updatePreferenceSchema) {}
