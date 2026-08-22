import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { ProvidersModule } from '../providers/providers.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DedicatedLineOrdersController } from './dedicated-line-orders.controller';
import { CreateDedicatedLineOrderUseCase } from './create-dedicated-line-order.use-case';
import { RenewDedicatedLineUseCase } from './renew-dedicated-line.use-case';
import { ReclaimExpiredReservationsUseCase, ReserveDedicatedLineStockUseCase } from './domain';
import { ReclaimExpiredReservationsRepository } from './reclaim-expired-reservations.repository';
import { DedicatedLineInventoryRepository } from './dedicated-line-inventory.repository';
import { DedicatedLineOrderRepository } from './dedicated-line-order.repository';
import { ProcessDedicatedLineOrderUseCase } from './process-dedicated-line-order.use-case';
import { DedicatedLinePlacementRepository } from './dedicated-line-placement.repository';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [ProvidersModule, CatalogModule, WalletModule],
  controllers: [DedicatedLineOrdersController],
  providers: [
    ConfigService,
    DedicatedLineInventoryRepository,
    DedicatedLineOrderRepository,
    DedicatedLinePlacementRepository,
    ReclaimExpiredReservationsRepository,
    ProcessDedicatedLineOrderUseCase,
    CreateDedicatedLineOrderUseCase,
    RenewDedicatedLineUseCase,
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
    ProcessDedicatedLineOrderUseCase,
    CreateDedicatedLineOrderUseCase,
    RenewDedicatedLineUseCase,
    ReclaimExpiredReservationsUseCase,
  ],
})
export class DedicatedLineOrdersModule {}
