import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors StockInfo from the service (stockInfoSelect + computed fields)
// Used by: GET /inventory/:productId, GET /inventory/low-stock (list item)
export class StockInfoDto {
  @ApiProperty({ description: 'Product CUID', example: 'clxyz123abc456' })
  id!: string;

  @ApiProperty({ description: 'Product name', example: 'Wireless Headphones' })
  name!: string;

  @ApiPropertyOptional({ description: 'Product SKU', example: 'WH-1000XM5' })
  sku!: string | null;

  @ApiProperty({ description: 'Total stock on hand', example: 100 })
  stock!: number;

  @ApiProperty({ description: 'Stock reserved by pending orders', example: 5 })
  reservedStock!: number;

  @ApiProperty({ description: 'Threshold that triggers low-stock alerts', example: 10 })
  lowStockThreshold!: number;

  @ApiProperty({ description: 'stock - reservedStock', example: 95 })
  availableStock!: number;

  @ApiProperty({ description: 'Whether available stock is at or below threshold', example: false })
  isLowStock!: boolean;
}

// Mirrors StockMovement from the service (movementSelect)
// Used by: GET /inventory/:productId/history (list item), POST /inventory/:productId/adjust (nested)
export class StockMovementDto {
  @ApiProperty({ example: 'clxyz789def012' })
  id!: string;

  @ApiProperty({ example: 'clxyz123abc456' })
  productId!: string;

  @ApiProperty({
    description: 'Type of stock movement',
    enum: ['ADJUSTMENT', 'RESTOCK', 'RETURN', 'SALE', 'RESERVATION', 'RELEASE'],
    example: 'ADJUSTMENT',
  })
  type!: string;

  @ApiProperty({ description: 'Signed quantity change (negative = decrease)', example: -5 })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Reason for the adjustment',
    example: 'Damaged goods removed',
  })
  reason!: string | null;

  @ApiProperty({ description: 'Stock level before this movement', example: 100 })
  stockBefore!: number;

  @ApiProperty({ description: 'Stock level after this movement', example: 95 })
  stockAfter!: number;

  @ApiPropertyOptional({ description: 'Admin who performed the action', example: 'clxyz456ghi789' })
  userId!: string | null;

  @ApiProperty({ example: '2025-01-15T12:00:00.000Z' })
  createdAt!: Date;
}

// Mirrors StockOperationResult from the service
// Used by: POST /inventory/:productId/adjust
export class StockOperationResultDto {
  @ApiProperty({ description: 'Updated stock info', type: StockInfoDto })
  product!: StockInfoDto;

  @ApiProperty({ description: 'The recorded stock movement', type: StockMovementDto })
  movement!: StockMovementDto;
}
