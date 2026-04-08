import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors notificationSelect from notifications.service.ts
export class NotificationDto {
  @ApiProperty({ description: 'Unique notification CUID', example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({
    description: 'Notification category',
    enum: [
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
    ],
    example: 'ORDER_CREATED',
  })
  type!: string;

  @ApiProperty({ description: 'Short notification headline', example: 'Order Confirmed' })
  title!: string;

  @ApiProperty({
    description: 'Notification body text',
    example: 'Your order ORD-20250615-0001 has been confirmed.',
  })
  body!: string;

  @ApiPropertyOptional({
    description: 'Polymorphic link to related entity (orderId, paymentId, productId)',
    example: 'clxyz789def012',
  })
  referenceId!: string | null;

  @ApiProperty({ description: 'Whether the user has read this notification', example: false })
  isRead!: boolean;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;
}

// Admin view includes userId to identify notification owner
export class AdminNotificationDto extends NotificationDto {
  @ApiProperty({ description: 'User who owns this notification', example: 'clxyz456def789' })
  userId!: string;
}

// Mirrors preferenceSelect from notifications.service.ts
export class NotificationPreferenceDto {
  @ApiProperty({ description: 'Unique preference CUID', example: 'clxyz456ghi789' })
  id!: string;

  @ApiProperty({
    description: 'Notification type this preference controls',
    enum: [
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
    ],
    example: 'ORDER_SHIPPED',
  })
  type!: string;

  @ApiProperty({
    description: 'Delivery channel',
    enum: ['IN_APP', 'EMAIL'],
    example: 'EMAIL',
  })
  channel!: string;

  @ApiProperty({
    description: 'Whether this channel is enabled for this type (opt-out model: missing = enabled)',
    example: true,
  })
  enabled!: boolean;
}

// Shared shape for unread-count and mark-all-as-read responses
export class CountResponseDto {
  @ApiProperty({ description: 'Number of affected or matching notifications', example: 5 })
  count!: number;
}
