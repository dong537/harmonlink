import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

export type ZoneStatus = 'ACTIVE' | 'ARCHIVED';

export type ZoneScope = {
  siteId: string;
  tenantId: string;
  userId: string;
};

export type Zone = {
  id: string;
  siteId: string;
  tenantId: string;
  userId: string;
  code: string;
  name: string;
  description: string | null;
  status: ZoneStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateZoneInput = {
  code: unknown;
  name: unknown;
  description?: unknown;
  sortOrder?: unknown;
};

export type UpdateZoneInput = {
  code?: unknown;
  name?: unknown;
  description?: unknown;
  sortOrder?: unknown;
};

export type PersistZoneInput = {
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

export function normalizeZoneCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_code_invalid', 400);
  }
  const code = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(code)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_code_invalid', 400);
  }
  return code;
}
export function normalizeZoneName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 200) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_name_invalid', 400);
  }
  return value.trim();
}

export function normalizeZoneDescription(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 2000) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_description_invalid', 400);
  }
  return value.trim() || null;
}

export function normalizeZoneSortOrder(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 999) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_sort_order_invalid', 400);
  }
  return value as number;
}

export function normalizeCreateZoneInput(input: CreateZoneInput): PersistZoneInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_body_invalid', 400);
  }
  return {
    code: normalizeZoneCode(input.code),
    name: normalizeZoneName(input.name),
    description: normalizeZoneDescription(input.description),
    sortOrder: normalizeZoneSortOrder(input.sortOrder),
  };
}

export function normalizeUpdateZoneInput(input: UpdateZoneInput): Partial<Omit<PersistZoneInput, 'code'>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_body_invalid', 400);
  }
  if (input.code !== undefined) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_code_immutable', 400);
  }
  const result: Partial<Omit<PersistZoneInput, 'code'>> = {};
  if (input.name !== undefined) result.name = normalizeZoneName(input.name);
  if (input.description !== undefined) result.description = normalizeZoneDescription(input.description);
  if (input.sortOrder !== undefined) result.sortOrder = normalizeZoneSortOrder(input.sortOrder);
  if (Object.keys(result).length === 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'zone_update_empty', 400);
  }
  return result;
}
