import { describe, it, expect } from 'vitest';
import { parsePagination, paginatedResult, paginationToSkipTake } from './pagination.js';

describe('pagination utilities', () => {
  it('should parse default pagination', () => {
    const result = parsePagination({});
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(20);
  });

  it('should parse custom pagination', () => {
    const result = parsePagination({ page: '3', perPage: '50' });
    expect(result.page).toBe(3);
    expect(result.perPage).toBe(50);
  });

  it('should clamp values', () => {
    const result = parsePagination({ page: '-1', perPage: '200' });
    expect(result.page).toBe(1);
    expect(result.perPage).toBe(100);
  });

  it('should create paginated result', () => {
    const items = ['a', 'b', 'c'];
    const result = paginatedResult(items, 10, { page: 2, perPage: 3 });
    expect(result.data).toEqual(items);
    expect(result.meta.total).toBe(10);
    expect(result.meta.page).toBe(2);
    expect(result.meta.perPage).toBe(3);
    expect(result.meta.totalPages).toBe(4);
  });

  it('should convert to skip/take', () => {
    const result = paginationToSkipTake({ page: 3, perPage: 10 });
    expect(result.skip).toBe(20);
    expect(result.take).toBe(10);
  });
});
