import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { CreateStaticProxyOrderUseCase } from './use-cases/create-static-proxy-order.use-case';
import { AdminOrderOperationsUseCase } from './use-cases/admin-order-operations.use-case';
import { WalletModule } from '../wallet/wallet.module';
import { PricingModule } from '../pricing/pricing.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { ConfigService } from '../../common/config/config.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [WalletModule, PricingModule, FulfillmentModule, AuthModule, UsersModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, CreateStaticProxyOrderUseCase, AdminOrderOperationsUseCase, ConfigService],
  exports: [OrdersRepository, CreateStaticProxyOrderUseCase, AdminOrderOperationsUseCase],
})
export class OrdersModule {}
