import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DedicatedLineOrdersModule } from '../dedicated-line-orders/dedicated-line-orders.module';
import { DedicatedLinesModule } from '../dedicated-lines/dedicated-lines.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ZonesModule } from '../zones/zones.module';
import { PaymentsModule } from '../payments/payments.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ConfigService } from '../../common/config/config.service';
import { ApiV1CompatController } from './api-v1-compat.controller';
import { LegacyCustomerResourcesController } from './legacy-customer-resources.controller';
import { LegacyZonesController } from './legacy-zones.controller';
import { LegacySurfaceController } from './legacy-surface.controller';

@Module({
  imports: [
    AuthModule,
    CatalogModule,
    DedicatedLineOrdersModule,
    DedicatedLinesModule,
    UsersModule,
    WalletModule,
    OrdersModule,
    NotificationsModule,
    TicketsModule,
    ZonesModule,
    PaymentsModule,
    ApiKeysModule,
  ],
  controllers: [ApiV1CompatController, LegacyCustomerResourcesController, LegacyZonesController, LegacySurfaceController],
  providers: [ConfigService],
})
export class ApiV1CompatModule {}
