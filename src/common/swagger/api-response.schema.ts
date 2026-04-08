import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors the meta object from TransformInterceptor (paginated responses)
export class PaginationMeta {
  @ApiProperty({ description: 'Total number of records', example: 50 })
  total!: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 5 })
  totalPages!: number;

  @ApiProperty({ description: 'Whether a next page exists', example: true })
  hasNextPage!: boolean;

  @ApiProperty({ description: 'Whether a previous page exists', example: false })
  hasPrevPage!: boolean;
}

// Mirrors the success response from TransformInterceptor
export class SuccessResponseSchema {
  @ApiProperty({ description: 'Always true for success responses', example: true })
  success!: boolean;

  @ApiProperty({ description: 'ISO 8601 timestamp', example: '2025-01-15T12:00:00.000Z' })
  timestamp!: string;

  @ApiPropertyOptional({ description: 'Pagination metadata', type: PaginationMeta })
  meta?: PaginationMeta;
}

// Mirrors the error response from GlobalExceptionFilter
export class ErrorResponseSchema {
  @ApiProperty({ description: 'Always false for error responses', example: false })
  success!: boolean;

  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode!: number;

  @ApiProperty({ description: 'Human-readable error message', example: 'Validation failed' })
  message!: string;

  @ApiProperty({ description: 'Error type name', example: 'Bad Request' })
  error!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp', example: '2025-01-15T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ description: 'Request path that caused the error', example: '/auth/login' })
  path!: string;
}
