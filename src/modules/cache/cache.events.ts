export const CacheEvents = {
  PRODUCT_CHANGED: 'cache.product.changed',
  CATEGORY_CHANGED: 'cache.category.changed',
} as const;

export class ProductChangedEvent {
  constructor(
    public readonly productId: string,
    public readonly action: 'create' | 'update' | 'delete' | 'deactivate' | 'image_change',
  ) {}
}

export class CategoryChangedEvent {
  constructor(
    public readonly categoryId: string,
    public readonly action: 'create' | 'update' | 'delete' | 'deactivate' | 'image_change',
  ) {}
}
