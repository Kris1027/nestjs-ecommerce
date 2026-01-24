import { type PaginationQuery } from '../dto/pagination.dto';

// Standardized paginated response format
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// Prisma pagination arguments
export interface PrismaPageArgs {
  skip: number;
  take: number;
}

// Convert pagination query to Prisma arguments
export function getPrismaPageArgs(query: PaginationQuery): PrismaPageArgs {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;

  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

// Build paginated response from Prisma results
export function paginate<T>(data: T[], total: number, query: PaginationQuery): PaginatedResult<T> {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
