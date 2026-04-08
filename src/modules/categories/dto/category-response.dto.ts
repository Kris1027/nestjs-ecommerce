import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ description: 'Category CUID', example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({ description: 'Category display name', example: 'Electronics' })
  name!: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'electronics' })
  slug!: string;

  @ApiPropertyOptional({ description: 'Category description', example: 'All electronic devices' })
  description!: string | null;

  @ApiPropertyOptional({
    description: 'Category image URL',
    example: 'https://res.cloudinary.com/...',
  })
  imageUrl!: string | null;

  @ApiPropertyOptional({ description: 'Cloudinary public ID for image management' })
  cloudinaryPublicId!: string | null;

  @ApiPropertyOptional({ description: 'Parent category ID for nesting', example: 'clxyz789def012' })
  parentId!: string | null;

  @ApiProperty({ description: 'Whether the category is visible', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Display order (lower = first)', example: 0 })
  sortOrder!: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;
}
