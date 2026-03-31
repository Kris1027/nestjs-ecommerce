import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductCategoryDto {
  @ApiProperty({ example: 'clxyz123abc456' })
  id: string;

  @ApiProperty({ example: 'Electronics' })
  name: string;

  @ApiProperty({ example: 'electronics' })
  slug: string;
}

export class ProductImageDto {
  @ApiProperty({ example: 'clxyz123abc456' })
  id: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/...' })
  url: string;

  @ApiPropertyOptional({ example: 'Product front view' })
  alt: string | null;

  @ApiPropertyOptional({
    description: 'Cloudinary public ID for image management',
    example: 'products/clxyz123abc456',
  })
  cloudinaryPublicId: string | null;

  @ApiProperty({ example: 0 })
  sortOrder: number;
}

// Compact shape returned in paginated product lists
export class ProductListItemDto {
  @ApiProperty({ example: 'clxyz123abc456' })
  id: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug: string;

  @ApiProperty({ description: 'Price as Decimal string', example: '99.99' })
  price: string;

  @ApiPropertyOptional({ description: 'Original price before discount', example: '149.99' })
  comparePrice: string | null;

  @ApiProperty({ example: 50 })
  stock: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: false })
  isFeatured: boolean;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ type: ProductCategoryDto })
  category: ProductCategoryDto;

  @ApiProperty({ type: [ProductImageDto], description: 'First image only in list view' })
  images: ProductImageDto[];
}

// Full shape returned for single product detail
export class ProductDetailDto extends ProductListItemDto {
  @ApiPropertyOptional({ example: 'High-quality wireless headphones with noise cancellation' })
  description: string | null;

  @ApiPropertyOptional({ example: 'WH-1000XM5' })
  sku: string | null;

  @ApiProperty({ example: 'clxyz789def012' })
  categoryId: string;

  @ApiProperty({ type: [ProductImageDto], description: 'All product images' })
  declare images: ProductImageDto[];
}
