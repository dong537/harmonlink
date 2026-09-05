"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DISPLAY_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.PageQueryDto = void 0;
exports.normalizePageQuery = normalizePageQuery;
class PageQueryDto {
    page = 1;
    pageSize = 20;
    search;
    sortBy;
    sortOrder;
    status;
    from;
    to;
}
exports.PageQueryDto = PageQueryDto;
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_DISPLAY_PAGE_SIZE = 20;
function normalizePageQuery(query = {}, options = {}) {
    const maxPageSize = options.maxPageSize ?? exports.MAX_DISPLAY_PAGE_SIZE;
    const page = normalizePositiveInteger(query.page, 1);
    const pageSize = Math.min(maxPageSize, normalizePositiveInteger(query.pageSize, exports.DEFAULT_PAGE_SIZE));
    return { page, pageSize };
}
function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1)
        return fallback;
    return parsed;
}
//# sourceMappingURL=pagination.dto.js.map