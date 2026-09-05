import { ErrorCode } from './error-codes';
export declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly reasonKey: string;
    readonly httpStatus: number;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: ErrorCode, reasonKey: string, httpStatus: number, message?: string, details?: Record<string, unknown> | undefined);
}
