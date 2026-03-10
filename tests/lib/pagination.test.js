/**
 * Unit tests for lib/pagination.js
 * Tests pagination parameter parsing and metadata generation
 */
import {
  getPaginationParams,
  createPaginationMeta,
  paginatedResponse,
  applyPagination,
} from '@/lib/pagination';

// Helper to create a mock Request-like object
function mockRequest(url) {
  return { url };
}

// ============================================================
// getPaginationParams
// ============================================================
describe('getPaginationParams', () => {
  it('should return defaults when no params provided', () => {
    const req = mockRequest('http://localhost/api/items');
    const result = getPaginationParams(req);
    expect(result).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('should parse page and limit from query string', () => {
    const req = mockRequest('http://localhost/api/items?page=3&limit=10');
    const result = getPaginationParams(req);
    expect(result).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('should cap limit at 100', () => {
    const req = mockRequest('http://localhost/api/items?page=1&limit=500');
    const result = getPaginationParams(req);
    expect(result.limit).toBe(100);
  });

  it('should handle page=0 (defaults to 1 via parseInt||1)', () => {
    const req = mockRequest('http://localhost/api/items?page=0');
    const result = getPaginationParams(req);
    // parseInt('0') is 0, which is falsy, so || 1 kicks in
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it('should handle negative page (NaN defaults to 1)', () => {
    const req = mockRequest('http://localhost/api/items?page=-1');
    const result = getPaginationParams(req);
    // parseInt('-1') is -1, truthy, so page = -1
    // skip = (-1 - 1) * 20 = -40
    expect(result.page).toBe(-1);
    expect(result.skip).toBe(-40);
  });

  it('should handle non-numeric values', () => {
    const req = mockRequest('http://localhost/api/items?page=abc&limit=xyz');
    const result = getPaginationParams(req);
    // parseInt('abc') is NaN, NaN || 1 = 1
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('should correctly calculate skip for page 5 with limit 10', () => {
    const req = mockRequest('http://localhost/api/items?page=5&limit=10');
    const result = getPaginationParams(req);
    expect(result.skip).toBe(40); // (5-1) * 10
  });
});

// ============================================================
// createPaginationMeta
// ============================================================
describe('createPaginationMeta', () => {
  it('should calculate total pages correctly', () => {
    const meta = createPaginationMeta(100, 1, 10);
    expect(meta.totalPages).toBe(10);
    expect(meta.total).toBe(100);
    expect(meta.page).toBe(1);
    expect(meta.limit).toBe(10);
  });

  it('should indicate hasNextPage on first page', () => {
    const meta = createPaginationMeta(50, 1, 10);
    expect(meta.hasNextPage).toBe(true);
    expect(meta.nextPage).toBe(2);
  });

  it('should indicate hasPrevPage on page > 1', () => {
    const meta = createPaginationMeta(50, 3, 10);
    expect(meta.hasPrevPage).toBe(true);
    expect(meta.prevPage).toBe(2);
  });

  it('should not have nextPage on last page', () => {
    const meta = createPaginationMeta(50, 5, 10);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.nextPage).toBeNull();
  });

  it('should not have prevPage on first page', () => {
    const meta = createPaginationMeta(50, 1, 10);
    expect(meta.hasPrevPage).toBe(false);
    expect(meta.prevPage).toBeNull();
  });

  it('should handle single page of results', () => {
    const meta = createPaginationMeta(5, 1, 10);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(false);
  });

  it('should handle zero total items', () => {
    const meta = createPaginationMeta(0, 1, 10);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
  });

  it('should ceil partial pages', () => {
    const meta = createPaginationMeta(11, 1, 10);
    expect(meta.totalPages).toBe(2);
    expect(meta.hasNextPage).toBe(true);
  });

  it('should handle large page numbers beyond total', () => {
    const meta = createPaginationMeta(10, 999, 10);
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
    expect(meta.hasPrevPage).toBe(true);
  });
});

// ============================================================
// paginatedResponse
// ============================================================
describe('paginatedResponse', () => {
  it('should return data with pagination metadata', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = paginatedResponse(data, 50, 1, 10);
    expect(result.data).toEqual(data);
    expect(result.pagination).toBeDefined();
    expect(result.pagination.total).toBe(50);
    expect(result.pagination.page).toBe(1);
  });

  it('should work with empty data', () => {
    const result = paginatedResponse([], 0, 1, 10);
    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });
});

// ============================================================
// applyPagination
// ============================================================
describe('applyPagination', () => {
  it('should chain skip and limit on query object', () => {
    const mockQuery = {
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    const result = applyPagination(mockQuery, 20, 10);

    expect(mockQuery.skip).toHaveBeenCalledWith(20);
    expect(mockQuery.limit).toHaveBeenCalledWith(10);
    expect(result).toBe(mockQuery);
  });
});
