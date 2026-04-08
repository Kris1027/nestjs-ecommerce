import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Nested product info inside each cart item
export class CartItemProductDto {
  @ApiProperty({ description: 'Product CUID', example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({ description: 'Product URL slug', example: 'wireless-headphones' })
  slug!: string;

  @ApiPropertyOptional({
    description: 'Primary product image URL',
    example: 'https://res.cloudinary.com/...',
  })
  imageUrl!: string | null;
}

// Single cart item with price calculations
export class CartItemDto {
  @ApiProperty({ description: 'Cart item CUID', example: 'clxyz789def012' })
  id!: string;

  @ApiProperty({ description: 'Quantity of this product in the cart', example: 2 })
  quantity!: number;

  @ApiProperty({ description: 'Price per unit as number', example: 99.99 })
  unitPrice!: number;

  @ApiProperty({ description: 'unitPrice * quantity', example: 199.98 })
  lineTotal!: number;

  @ApiProperty({ description: 'Product summary', type: CartItemProductDto })
  product!: CartItemProductDto;
}

// Full cart response returned by all 5 endpoints
// Mirrors CartResponse type from cart.service.ts
export class CartResponseDto {
  @ApiProperty({
    description: 'Cart CUID (empty string if no cart exists yet)',
    example: 'clxyz456ghi789',
  })
  id!: string;

  @ApiProperty({ description: 'Cart items with product info and prices', type: [CartItemDto] })
  items!: CartItemDto[];

  @ApiProperty({ description: 'Sum of all item quantities', example: 3 })
  totalItems!: number;

  @ApiProperty({ description: 'Sum of all line totals', example: 299.97 })
  subtotal!: number;

  @ApiPropertyOptional({
    description: 'Applied coupon code',
    example: 'SAVE10',
  })
  couponCode!: string | null;

  @ApiProperty({
    description: 'Discount amount from coupon (0 if no coupon)',
    example: 29.99,
  })
  discountAmount!: number;

  @ApiProperty({
    description: 'Estimated total after discount (subtotal - discountAmount)',
    example: 269.98,
  })
  estimatedTotal!: number;
}
