export const CACHE_PREFIXES = {
  PRODUCTS_LIST: 'cache:products:list',
  PRODUCTS_DETAIL: 'cache:products:detail',
  CATEGORIES_LIST: 'cache:categories:list',
  CATEGORIES_TREE: 'cache:categories:tree',
  CATEGORIES_DETAIL: 'cache:categories:detail',
} as const;

export const CACHE_TTL = {
  PRODUCTS_LIST: 300_000,
  PRODUCTS_DETAIL: 600_000,
  CATEGORIES_LIST: 600_000,
  CATEGORIES_TREE: 1_800_000,
  CATEGORIES_DETAIL: 600_000,
} as const;

export const INVALIDATION_PREFIXES = {
  ALL_PRODUCTS: 'cache:products:',
  ALL_CATEGORIES: 'cache:categories:',
} as const;
