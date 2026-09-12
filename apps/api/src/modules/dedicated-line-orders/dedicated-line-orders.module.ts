import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { ProvidersModule } from '../providers/providers.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DedicatedLineOrdersController } from './dedicated-line-orders.controller';
import { CreateDedicatedLineOrderUseCase } from './create-dedicated-line-order.use-case';
import { ReclaimExpiredReservationsUseCase, ReserveDedicatedLineStockUseCase } from './domain';
import { ReclaimExpiredReservationsRepository } from './reclaim-expired-reservations.repository';
import { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import { DedicatedLineOrderRepository } from './dedicated-line-order.repository';
import { ProcessDedicatedLineOrderUseCase } from './process-dedicated-line-order.use-case';
import { DedicatedLinePlacementRepository } from './dedicated-line-placement.repository';
import { WalletModule } from '../wallet/wallet.module';
import { ZonesModule } from '../zones/zones.module';
import { DedicatedLineOrderAdminController } from './dedicated-line-order-admin.controller';
import { DedicatedLineOrderAdminRepository } from './dedicated-line-order-admin.repository';
import { DedicatedLineOrderAdminUseCase } from './dedicated-line-order-admin.use-case';

@Module({
  imports: [ProvidersModule, CatalogModule, WalletModule, ZonesModule],
  controllers: [DedicatedLineOrdersController, DedicatedLineOrderAdminController],
  providers: [
    ConfigService,
    DedicatedLineInventoryRepository,
    DedicatedLineOrderRepository,
    DedicatedLinePlacementRepository,
    DedicatedLineOrderAdminRepository,
    DedicatedLineOrderAdminUseCase,
    ReclaimExpiredReservationsRepository,
    ProcessDedicatedLineOrderUseCase,
    CreateDedicatedLineOrderUseCase,
    {
      provide: ReserveDedicatedLineStockUseCase,
      inject: [DedicatedLineInventoryRepository],
      useFactory: (inventory: DedicatedLineInventoryRepository) => new ReserveDedicatedLineStockUseCase(inventory),
    },
    {
      provide: ReclaimExpiredReservationsUseCase,
      inject: [ReclaimExpiredReservationsRepository],
      useFactory: (source: ReclaimExpiredReservationsRepository) => new ReclaimExpiredReservationsUseCase(source),
    },
  ],
  exports: [
    DedicatedLineInventoryRepository,
    DedicatedLineOrderRepository,
    DedicatedLineOrderAdminRepository,
    DedicatedLineOrderAdminUseCase,
    ProcessDedicatedLineOrderUseCase,
    CreateDedicatedLineOrderUseCase,
    ReclaimExpiredReservationsUseCase,
  ],
})
export class DedicatedLineOrdersModule {}
