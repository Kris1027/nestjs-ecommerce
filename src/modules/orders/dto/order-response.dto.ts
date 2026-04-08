import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors orderItemSelect from the service
export class OrderItemDto {
  @ApiProperty({ example: 'clxyz123abc456' })
  id!: string;

  @ApiPropertyOptional({
    description: 'Product ID (null if product was deleted)',
    example: 'clxyz789def012',
  })
  productId!: string | null;

  @ApiProperty({
    description: 'Product name at time of order',
    example: 'Wireless Headphones',
  })
  productName!: string;

  @ApiPropertyOptional({
    description: 'Product SKU at time of order',
    example: 'WH-1000XM5',
  })
  productSku!: string | null;

  @ApiPropertyOptional({
    description: 'Product image URL at time of order',
    example: 'https://res.cloudinary.com/...',
  })
  productImageUrl!: string | null;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({
    description: 'Price per unit as Decimal string',
    example: '99.99',
  })
  unitPrice!: string;

  @ApiProperty({
    description: 'unitPrice * quantity as Decimal string',
    example: '199.98',
  })
  lineTotal!: string;
}

// Mirrors orderListSelect — compact shape for paginated lists
export class OrderListDto {
  @ApiProperty({ example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({
    description: 'Unique order number',
    example: 'ORD-20250115-A1B2',
  })
  orderNumber!: string;

  @ApiProperty({
    enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    example: 'PENDING',
  })
  status!: string;

  @ApiProperty({ description: 'Decimal string', example: '199.98' })
  subtotal!: string;

  @ApiProperty({ description: 'Decimal string', example: '20.00' })
  discountAmount!: string;

  @ApiPropertyOptional({
    description: 'Applied coupon code',
    example: 'SAVE20',
  })
  couponCode!: string | null;

  @ApiProperty({ description: 'Decimal string', example: '9.99' })
  shippingCost!: string;

  @ApiProperty({ description: 'Decimal string', example: '0.00' })
  tax!: string;

  @ApiProperty({ description: 'Decimal string', example: '189.97' })
  total!: string;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}

// Mirrors orderDetailSelect — full shape with items and shipping address
export class OrderDetailDto extends OrderListDto {
  @ApiProperty({ example: 'clxyz456ghi789' })
  userId!: string;

  @ApiProperty({ example: 'John Doe' })
  shippingFullName!: string;

  @ApiProperty({ example: '+48123456789' })
  shippingPhone!: string;

  @ApiProperty({ example: 'ul. Marszalkowska 1' })
  shippingStreet!: string;

  @ApiProperty({ example: 'Warsaw' })
  shippingCity!: string;

  @ApiPropertyOptional({ example: 'Mazowieckie' })
  shippingRegion!: string | null;

  @ApiProperty({ example: '00-001' })
  shippingPostalCode!: string;

  @ApiProperty({ example: 'PL' })
  shippingCountry!: string;

  @ApiPropertyOptional({
    description: 'Shipping method name snapshot',
    example: 'Standard Delivery',
  })
  shippingMethodName!: string | null;

  @ApiPropertyOptional({
    description: 'Customer notes for the order',
    example: 'Please leave at the door',
  })
  notes!: string | null;

  @ApiPropertyOptional({
    description: 'Internal admin notes',
    example: 'Customer called to change address',
  })
  adminNotes!: string | null;

  @ApiProperty({
    description: 'Order line items with product snapshots',
    type: [OrderItemDto],
  })
  items!: OrderItemDto[];
}
