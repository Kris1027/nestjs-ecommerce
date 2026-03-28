import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheService } from './cache.service';
import { INVALIDATION_PREFIXES } from './cache.constants';
import { CacheEvents, type ProductChangedEvent, type CategoryChangedEvent } from './cache.events';
import { NotificationEvents } from '../notifications/events';

@Injectable()
export class CacheInvalidationListener {
  private readonly logger = new Logger(CacheInvalidationListener.name);

  constructor(private readonly cacheService: CacheService) {}

  @OnEvent(CacheEvents.PRODUCT_CHANGED, { async: true })
  async handleProductChanged(event: ProductChangedEvent): Promise<void> {
    this.logger.debug(`Invalidating product cache: ${event.action} ${event.productId}`);
    await this.cacheService.invalidateByPrefix(INVALIDATION_PREFIXES.ALL_PRODUCTS);
  }

  @OnEvent(CacheEvents.CATEGORY_CHANGED, { async: true })
  async handleCategoryChanged(event: CategoryChangedEvent): Promise<void> {
    this.logger.debug(`Invalidating category cache: ${event.action} ${event.categoryId}`);
    await this.cacheService.invalidateByPrefix(INVALIDATION_PREFIXES.ALL_CATEGORIES);
  }

  @OnEvent(NotificationEvents.ORDER_CREATED, { async: true })
  async handleOrderCreated(): Promise<void> {
    this.logger.debug('Invalidating product cache: order created (stock reserved)');
    await this.cacheService.invalidateByPrefix(INVALIDATION_PREFIXES.ALL_PRODUCTS);
  }

  @OnEvent(NotificationEvents.ORDER_STATUS_CHANGED, { async: true })
  async handleOrderStatusChanged(): Promise<void> {
    this.logger.debug('Invalidating product cache: order status changed (stock affected)');
    await this.cacheService.invalidateByPrefix(INVALIDATION_PREFIXES.ALL_PRODUCTS);
  }

  @OnEvent(NotificationEvents.LOW_STOCK, { async: true })
  async handleLowStock(): Promise<void> {
    this.logger.debug('Invalidating product cache: low stock detected');
    await this.cacheService.invalidateByPrefix(INVALIDATION_PREFIXES.ALL_PRODUCTS);
  }
}
