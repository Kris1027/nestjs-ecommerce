import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Nested product info
export class GuestCartItemProductDto {
  @ApiProperty({ example: 'cuid_abc123' })
  id!: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug!: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/...' })
  imageUrl!: string | null;
}

// Single cart item
export class GuestCartItemDto {
  @ApiProperty({ example: 'cuid_item456' })
  id!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({ example: 99.99 })
  unitPrice!: number;

  @ApiProperty({ example: 199.98 })
  lineTotal!: number;

  @ApiProperty({ type: GuestCartItemProductDto })
  product!: GuestCartItemProductDto;
}

// Full guest cart response
export class GuestCartResponseDto {
  @ApiProperty({ example: 'cuid_cart789' })
  id!: string;

  @ApiProperty({ type: [GuestCartItemDto] })
  items!: GuestCartItemDto[];

  @ApiProperty({ example: 3 })
  totalItems!: number;

  @ApiProperty({ example: 299.97 })
  subtotal!: number;
}
