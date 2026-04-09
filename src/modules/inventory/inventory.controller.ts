import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CurrentUser, Roles } from '../../common/decorators';
import {
  AdjustStockDto,
  InventoryQueryDto,
  StockInfoDto,
  StockMovementDto,
  StockOperationResultDto,
} from './dto';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { StockMovementType } from '../../generated/prisma/client';
import { ApiErrorResponses, ApiPaginatedResponse, ApiSuccessResponse } from '../../common/swagger';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ============================================
  // ADMIN ENDPOINTS
  // ============================================

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all products with stock info, optionally filtered (admin)' })
  @ApiPaginatedResponse(StockInfoDto, 'Paginated product stock list')
  @ApiErrorResponses(401, 403, 429)
  getProducts(@Query() query: InventoryQueryDto): ReturnType<InventoryService['getAllProducts']> {
    if (query.filter === 'low-stock') {
      return this.inventoryService.getLowStockProducts(query);
    }

    return this.inventoryService.getAllProducts(query);
  }

  @Get('low-stock')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List products below low-stock threshold (admin)' })
  @ApiPaginatedResponse(StockInfoDto, 'Paginated low-stock product list')
  @ApiErrorResponses(401, 403, 429)
  getLowStockProducts(
    @Query() query: PaginationQueryDto,
  ): ReturnType<InventoryService['getLowStockProducts']> {
    return this.inventoryService.getLowStockProducts(query);
  }

  @Get(':productId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get stock info for a product (admin)' })
  @ApiParam({ name: 'productId', description: 'Product CUID' })
  @ApiSuccessResponse(StockInfoDto, 200, 'Stock info retrieved')
  @ApiErrorResponses(401, 403, 404, 429)
  getStock(@Param('productId') productId: string): ReturnType<InventoryService['getStock']> {
    return this.inventoryService.getStock(productId);
  }

  @Get(':productId/history')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'View stock movement audit trail (admin)' })
  @ApiParam({ name: 'productId', description: 'Product CUID' })
  @ApiPaginatedResponse(StockMovementDto, 'Paginated stock movement history')
  @ApiErrorResponses(401, 403, 404, 429)
  getMovementHistory(
    @Param('productId') productId: string,
    @Query() query: PaginationQueryDto,
  ): ReturnType<InventoryService['getMovementHistory']> {
    return this.inventoryService.getMovementHistory(productId, query);
  }

  @Post(':productId/adjust')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Adjust stock with reason tracking (admin)' })
  @ApiParam({ name: 'productId', description: 'Product CUID' })
  @ApiSuccessResponse(StockOperationResultDto, 200, 'Stock adjusted')
  @ApiErrorResponses(400, 401, 403, 404, 429)
  adjustStock(
    @Param('productId') productId: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser('sub') userId: string,
  ): ReturnType<InventoryService['adjustStock']> {
    return this.inventoryService.adjustStock(
      productId,
      dto.quantity,
      StockMovementType[dto.type],
      userId,
      dto.reason,
    );
  }
}
