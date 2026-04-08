import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors shippingMethodSelect from shipping.service.ts
export class ShippingMethodDto {
  @ApiProperty({ description: 'Unique shipping method CUID', example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({ description: 'Method display name', example: 'Standard Delivery' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Human-readable description',
    example: 'Delivered within 3-5 business days',
  })
  description!: string | null;

  @ApiProperty({ description: 'Base shipping price', example: '9.99' })
  basePrice!: string;

  @ApiPropertyOptional({
    description: 'Order subtotal above which shipping is free (null = never free)',
    example: '100.00',
  })
  freeShippingThreshold!: string | null;

  @ApiProperty({
    description: 'Estimated delivery time in business days',
    example: '3-5 business days',
  })
  estimatedDays!: string;

  @ApiProperty({ description: 'Display order (lower = first)', example: 1 })
  sortOrder!: number;

  @ApiProperty({ description: 'Whether this method is available at checkout', example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}
