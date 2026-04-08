import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Nested order summary inside payment responses
export class PaymentOrderDto {
  @ApiProperty({
    description: 'Order number',
    example: 'ORD-20250115-A1B2',
  })
  orderNumber!: string;

  @ApiProperty({
    enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    example: 'CONFIRMED',
  })
  status!: string;
}

// Mirrors paymentSelect from the service
export class PaymentDto {
  @ApiProperty({ example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({ example: 'clxyz789def012' })
  orderId!: string;

  @ApiProperty({
    description: 'Stripe PaymentIntent ID',
    example: 'pi_3abc123def456',
  })
  stripePaymentIntentId!: string;

  @ApiProperty({
    enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED'],
    example: 'SUCCEEDED',
  })
  status!: string;

  @ApiProperty({
    description: 'Amount in PLN as Decimal string',
    example: '199.98',
  })
  amount!: string;

  @ApiProperty({ example: 'pln' })
  currency!: string;

  @ApiProperty({
    description: 'Total refunded amount as Decimal string',
    example: '0.00',
  })
  refundedAmount!: string;

  @ApiPropertyOptional({
    description: 'Stripe refund ID if refund was initiated',
    example: 're_3abc123def456',
  })
  stripeRefundId!: string | null;

  @ApiPropertyOptional({
    description: 'Reason provided for refund',
    example: 'Customer requested cancellation',
  })
  refundReason!: string | null;

  @ApiPropertyOptional({
    description: 'Stripe failure code',
    example: 'card_declined',
  })
  failureCode!: string | null;

  @ApiPropertyOptional({
    description: 'Stripe failure message',
    example: 'Your card was declined',
  })
  failureMessage!: string | null;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

// Mirrors paymentWithOrderSelect — includes nested order summary
export class PaymentWithOrderDto extends PaymentDto {
  @ApiProperty({
    description: 'Related order summary',
    type: PaymentOrderDto,
  })
  order!: PaymentOrderDto;
}

// Returned by POST /payments/create-intent
export class PaymentIntentResponseDto {
  @ApiPropertyOptional({
    description: 'Stripe client secret for frontend confirmation',
    example: 'pi_3abc123def456_secret_xyz789',
  })
  clientSecret!: string | null;
}

// Returned by POST /payments/webhook
export class WebhookResponseDto {
  @ApiProperty({ example: true })
  received!: boolean;
}

// Returned by POST /payments/expire-abandoned
export class ExpireAbandonedResponseDto {
  @ApiProperty({
    description: 'Number of payments expired',
    example: 3,
  })
  expired!: number;
}
