import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  normalizeCreateZoneInput,
  normalizeUpdateZoneInput,
  normalizeZoneCode,
  type CreateZoneInput,
  type UpdateZoneInput,
  type Zone,
  type ZoneScope,
} from './domain';
import { ZonesRepository } from './zones.repository';

@Injectable()
export class ListZonesUseCase {
  constructor(private readonly repository: ZonesRepository) {}

  execute(scope: ZoneScope, includeArchived = false): Promise<Zone[]> {
    return this.repository.listForOwner(scope, { includeArchived });
  }
}

@Injectable()
export class CreateZoneUseCase {
  constructor(private readonly repository: ZonesRepository) {}

  async execute(scope: ZoneScope, input: CreateZoneInput): Promise<Zone> {
    const data = normalizeCreateZoneInput(input);
    if (await this.repository.findByCode(scope, data.code)) {
      throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_code_taken', 409);
    }
    return this.repository.create(scope, data);
  }
}

@Injectable()
export class UpdateZoneUseCase {
  constructor(private readonly repository: ZonesRepository) {}

  async execute(scope: ZoneScope, id: string, input: UpdateZoneInput): Promise<Zone> {
    const data = normalizeUpdateZoneInput(input);
    const existing = await this.repository.getForOwner(scope, id);
    if (existing.status === 'ARCHIVED') {
      throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_archived', 409);
    }
    return this.repository.update(scope, id, data);
  }
}

@Injectable()
export class ArchiveZoneUseCase {
  constructor(private readonly repository: ZonesRepository) {}

  execute(scope: ZoneScope, id: string): Promise<Zone> {
    return this.repository.archive(scope, id);
  }
}

@Injectable()
export class DeleteZoneUseCase {
  constructor(private readonly repository: ZonesRepository) {}

  async execute(scope: ZoneScope, id: string): Promise<void> {
    await this.repository.getForOwner(scope, id);
    const dependencies = await this.repository.countDependencies(scope, id);
    if (dependencies.orders > 0 || dependencies.lines > 0) {
      throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_has_dependencies', 409, undefined, dependencies);
    }
    await this.repository.delete(scope, id);
  }
}

@Injectable()
export class ResolveActiveZoneUseCase {
  constructor(private readonly repository: ZonesRepository) {}

  async execute(scope: ZoneScope, code: unknown): Promise<Zone | null> {
    if (code === undefined || code === null || code === '') return null;
    const normalized = normalizeZoneCode(code);
    const zone = await this.repository.findByCode(scope, normalized);
    if (!zone) throw new AppError(ErrorCode.NOT_FOUND, 'zone_not_found', 404);
    if (zone.status !== 'ACTIVE') throw new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'zone_archived', 409);
    return zone;
  }
}
