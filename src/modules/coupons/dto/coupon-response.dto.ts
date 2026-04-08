import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors couponSelect from coupons.service.ts — describes the shape
// Swagger reads to generate the "Coupon" schema in the docs UI.
export class CouponDto {
  @ApiProperty({ description: 'Unique coupon CUID', example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({ description: 'Coupon code (uppercase)', example: 'SUMMER20' })
  code!: string;

  @ApiPropertyOptional({
    description: 'Human-readable description',
    example: '20% off summer sale',
  })
  description!: string | null;

  @ApiProperty({
    description: 'Discount type',
    enum: ['PERCENTAGE', 'FIXED_AMOUNT'],
    example: 'PERCENTAGE',
  })
  type!: string;

  @ApiProperty({
    description: 'Discount value (percentage 0-100, or fixed amount)',
    example: '20.00',
  })
  value!: string;

  @ApiPropertyOptional({
    description: 'Minimum order subtotal required to use this coupon',
    example: '50.00',
  })
  minimumOrderAmount!: string | null;

  @ApiPropertyOptional({
    description: 'Maximum discount cap (for percentage coupons)',
    example: '30.00',
  })
  maximumDiscount!: string | null;

  @ApiPropertyOptional({ description: 'Total uses allowed (null = unlimited)', example: 100 })
  usageLimit!: number | null;

  @ApiPropertyOptional({ description: 'Uses allowed per user (null = unlimited)', example: 1 })
  usageLimitPerUser!: number | null;

  @ApiProperty({ description: 'How many times this coupon has been used', example: 42 })
  usageCount!: number;

  @ApiProperty({ description: 'Start of validity window', example: '2025-06-01T00:00:00.000Z' })
  validFrom!: Date;

  @ApiProperty({ description: 'End of validity window', example: '2025-08-31T23:59:59.000Z' })
  validUntil!: Date;

  @ApiProperty({ description: 'Whether the coupon is active', example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

// Response shape from validateCoupon() in the service
export class ValidateCouponResponseDto {
  @ApiProperty({ description: 'Matched coupon CUID', example: 'clxyz123abc456' })
  couponId!: string;

  @ApiProperty({ description: 'Calculated discount amount', example: 15.0 })
  discountAmount!: number;
}
