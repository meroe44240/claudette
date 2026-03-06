export interface PaginationParams {
  page: number;
  perPage: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

export function parsePagination(query: { page?: string; perPage?: string }): PaginationParams {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(query.perPage || '20', 10) || 20));
  return { page, perPage };
}

export function paginatedResult<T>(data: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  return {
    data,
    meta: {
      total,
      page: params.page,
      perPage: params.perPage,
      totalPages: Math.ceil(total / params.perPage),
    },
  };
}

export function paginationToSkipTake(params: PaginationParams) {
  return {
    skip: (params.page - 1) * params.perPage,
    take: params.perPage,
  };
}
