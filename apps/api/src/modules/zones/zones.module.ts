import { Module } from '@nestjs/common';
import { ZonesRepository } from './zones.repository';
import {
  ArchiveZoneUseCase,
  CreateZoneUseCase,
  DeleteZoneUseCase,
  ListZonesUseCase,
  ResolveActiveZoneUseCase,
  UpdateZoneUseCase,
} from './use-cases';

@Module({
  providers: [
    ZonesRepository,
    ListZonesUseCase,
    CreateZoneUseCase,
    UpdateZoneUseCase,
    ArchiveZoneUseCase,
    DeleteZoneUseCase,
    ResolveActiveZoneUseCase,
  ],
  exports: [
    ZonesRepository,
    ListZonesUseCase,
    CreateZoneUseCase,
    UpdateZoneUseCase,
    ArchiveZoneUseCase,
    DeleteZoneUseCase,
    ResolveActiveZoneUseCase,
  ],
})
export class ZonesModule {}
