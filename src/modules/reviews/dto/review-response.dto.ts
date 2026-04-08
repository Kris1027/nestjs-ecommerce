import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Nested reviewer info (public-safe, no email/password)
export class ReviewUserDto {
  @ApiProperty({ example: 'clxyz123abc456' })
  id!: string;

  @ApiPropertyOptional({ example: 'John' })
  firstName!: string | null;

  @ApiPropertyOptional({ example: 'Doe' })
  lastName!: string | null;
}

// Nested product summary
export class ReviewProductDto {
  @ApiProperty({ example: 'clxyz789def012' })
  id!: string;

  @ApiProperty({ example: 'Wireless Headphones' })
  name!: string;

  @ApiProperty({ example: 'wireless-headphones' })
  slug!: string;
}

// Mirrors reviewSelect from the service
export class ReviewDto {
  @ApiProperty({ example: 'clxyz456ghi789' })
  id!: string;

  @ApiProperty({
    description: 'Star rating 1-5',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  rating!: number;

  @ApiPropertyOptional({
    description: 'Review headline',
    example: 'Great sound quality',
  })
  title!: string | null;

  @ApiProperty({
    description: 'Review body text',
    example: 'Best headphones I have ever owned.',
  })
  comment!: string;

  @ApiProperty({
    description: 'Moderation status',
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    example: 'APPROVED',
  })
  status!: string;

  @ApiPropertyOptional({
    description: 'Admin moderation note',
    example: 'Approved — meets guidelines',
  })
  adminNote!: string | null;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    description: 'Reviewer public info',
    type: ReviewUserDto,
  })
  user!: ReviewUserDto;

  @ApiProperty({
    description: 'Reviewed product summary',
    type: ReviewProductDto,
  })
  product!: ReviewProductDto;
}
