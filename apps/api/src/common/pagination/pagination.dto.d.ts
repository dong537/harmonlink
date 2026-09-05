export declare class PageQueryDto {
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    from?: string;
    to?: string;
}
export interface PageResult<T> {
    page: number;
    pageSize: number;
    total: number;
    items: T[];
}
export declare const DEFAULT_PAGE_SIZE = 20;
export declare const MAX_DISPLAY_PAGE_SIZE = 20;
export declare function normalizePageQuery(query?: Pick<PageQueryDto, 'page' | 'pageSize'>, options?: {
    maxPageSize?: number;
}): {
    page: number;
    pageSize: number;
};
