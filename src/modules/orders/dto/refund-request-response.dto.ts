import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Response DTO for Swagger documentation
// Uses @ApiProperty decorators (not Zod) because Swagger needs class metadata
export class RefundRequestResponseDto {
  @ApiProperty({ example: 'cuid_abc123' })
  id!: string;

  @ApiProperty({ example: 'cuid_order456' })
  orderId!: string;

  @ApiProperty({ example: 'Product arrived damaged, screen has cracks' })
  reason!: string;

  @ApiProperty({
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'],
    example: 'PENDING',
  })
  status!: string;

  @ApiPropertyOptional({
    example: 'Approved for full refund',
    description: 'Admin notes visible to customer after review',
  })
  adminNotes!: string | null;

  @ApiPropertyOptional({
    example: '2026-02-06T12:00:00.000Z',
    description: 'When admin reviewed the request',
  })
  reviewedAt!: Date | null;

  @ApiProperty({ example: '2026-02-06T10:00:00.000Z' })
  createdAt!: Date;
}
