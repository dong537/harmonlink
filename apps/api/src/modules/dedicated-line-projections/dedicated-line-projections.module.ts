import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { DedicatedLineProjectionRepository } from './dedicated-line-projection.repository';
import { ManagedLineProjectionAdapter } from './managed-line-projection.adapter';
import { ProcessDedicatedLineProjectionUseCase } from './process-dedicated-line-projection.use-case';

@Module({
  providers: [
    ConfigService,
    DedicatedLineProjectionRepository,
    ManagedLineProjectionAdapter,
    ProcessDedicatedLineProjectionUseCase,
  ],
  exports: [
    DedicatedLineProjectionRepository,
    ManagedLineProjectionAdapter,
    ProcessDedicatedLineProjectionUseCase,
  ],
})
export class DedicatedLineProjectionsModule {}
