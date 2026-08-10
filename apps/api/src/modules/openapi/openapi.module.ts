import { Module } from '@nestjs/common';
import { ResStaticController } from './res-static.controller';
import { ResourcesModule } from '../resources/resources.module';
import { PricingModule } from '../pricing/pricing.module';
import { OrdersModule } from '../orders/orders.module';
import { ProxiesModule } from '../proxies/proxies.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigService } from '../../common/config/config.service';

@Module({
  imports: [ResourcesModule, PricingModule, OrdersModule, ProxiesModule, WalletModule, AuthModule],
  controllers: [ResStaticController],
  providers: [ConfigService],
})
export class OpenApiModule {}
