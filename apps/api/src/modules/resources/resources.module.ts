import { Module } from '@nestjs/common';
import { ResourcesRepository } from './resources.repository';
import { ResourcesController } from './resources.controller';
import { SyncInventoryUseCase } from './use-cases/sync-inventory.use-case';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  providers: [ResourcesRepository, SyncInventoryUseCase],
  controllers: [ResourcesController],
  exports: [ResourcesRepository, SyncInventoryUseCase],
})
export class ResourcesModule {}
