import { z } from 'zod';

const ListPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional(),
});

export interface ListPaginationQuery {
  page?: string | number;
  per_page?: string | number;
  cursor?: string;
}

export interface ListPagination {
  page: number;
  perPage: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  next_cursor: string | null;
}

export function parseListPagination(query: ListPaginationQuery): ListPagination {
  const parsed = ListPaginationSchema.parse(query);
  const offset = parsed.cursor
    ? decodePaginationCursor(parsed.cursor)
    : (parsed.page - 1) * parsed.per_page;
  return {
    page: parsed.cursor ? Math.floor(offset / parsed.per_page) + 1 : parsed.page,
    perPage: parsed.per_page,
    offset,
  };
}

export function paginateItems<T>(
  items: T[],
  pagination: ListPagination,
): { items: T[]; pagination: PaginationMeta } {
  const pageItems = items.slice(pagination.offset, pagination.offset + pagination.perPage);
  return {
    items: pageItems,
    pagination: paginationMeta(pagination, pagination.offset + pageItems.length < items.length),
  };
}

export function paginationMeta(pagination: ListPagination, hasMore: boolean): PaginationMeta {
  return {
    page: pagination.page,
    per_page: pagination.perPage,
    next_cursor: hasMore ? encodePaginationCursor(pagination.offset + pagination.perPage) : null,
  };
}

export function encodePaginationCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url');
}

function decodePaginationCursor(cursor: string): number {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^\d+$/.test(decoded)) throw invalidCursorError();
  const offset = Number(decoded);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw invalidCursorError();
  }
  return offset;
}

function invalidCursorError(): z.ZodError {
  return new z.ZodError([
    {
      code: 'custom',
      path: ['cursor'],
      message: 'Cursor de paginação inválido.',
    },
  ]);
}
