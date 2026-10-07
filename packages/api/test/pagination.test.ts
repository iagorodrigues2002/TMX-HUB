import { describe, expect, it } from 'vitest';
import {
  encodePaginationCursor,
  paginateItems,
  parseListPagination,
} from '../src/lib/pagination.js';

describe('list pagination', () => {
  it('defaults to the first 50 items', () => {
    const parsed = parseListPagination({});
    const result = paginateItems(
      Array.from({ length: 60 }, (_, index) => index),
      parsed,
    );

    expect(parsed).toEqual({ page: 1, perPage: 50, offset: 0 });
    expect(result.items).toHaveLength(50);
    expect(result.pagination).toEqual({
      page: 1,
      per_page: 50,
      next_cursor: encodePaginationCursor(50),
    });
  });

  it('accepts page/per_page and an opaque cursor', () => {
    expect(parseListPagination({ page: '3', per_page: '10' })).toEqual({
      page: 3,
      perPage: 10,
      offset: 20,
    });
    expect(parseListPagination({ cursor: encodePaginationCursor(30), per_page: '10' })).toEqual({
      page: 4,
      perPage: 10,
      offset: 30,
    });
  });

  it('rejects invalid cursors and page sizes above 100', () => {
    expect(() => parseListPagination({ cursor: 'not-a-cursor' })).toThrow();
    expect(() => parseListPagination({ per_page: '101' })).toThrow();
  });
});
