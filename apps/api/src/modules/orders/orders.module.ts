import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { AdminOrderOperationsUseCase } from './use-cases/admin-order-operations.use-case';
import { CreateStaticProxyOrderUseCase } from './use-cases/create-static-proxy-order.use-case';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { UsersModule } from '../users/users.module';
import { ConfigService } from '../../common/config/config.service';

@Module({
  imports: [WalletModule, AuthModule, PricingModule, FulfillmentModule, UsersModule],
  controllers: [OrdersController],
  providers: [OrdersRepository, AdminOrderOperationsUseCase, CreateStaticProxyOrderUseCase, ConfigService],
  exports: [OrdersRepository, AdminOrderOperationsUseCase, CreateStaticProxyOrderUseCase],
})
export class OrdersModule {}
