/**
 * Pagination helper utilities
 */

/**
 * Parse pagination parameters from request
 * @param {Request} request - Next.js request object
 * @returns {Object} - { page, limit, skip }
 */
export function getPaginationParams(request) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100); // Max 100 items per page
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
}

/**
 * Create pagination metadata
 * @param {number} total - Total number of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination metadata
 */
export function createPaginationMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? page + 1 : null,
    prevPage: hasPrevPage ? page - 1 : null,
  };
}

/**
 * Create paginated response
 * @param {Array} data - Data array
 * @param {number} total - Total count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} - Paginated response
 */
export function paginatedResponse(data, total, page, limit) {
  return {
    data,
    pagination: createPaginationMeta(total, page, limit),
  };
}

/**
 * Apply pagination to MongoDB query
 * @param {Object} query - MongoDB query object
 * @param {number} skip - Number of items to skip
 * @param {number} limit - Number of items to return
 * @returns {Object} - Query with pagination applied
 */
export function applyPagination(query, skip, limit) {
  return query.skip(skip).limit(limit);
}
