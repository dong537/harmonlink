import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { WalletModule } from '../wallet/wallet.module';
import { CustomerResellerController } from './customer-reseller.controller';
import { CustomerResellerRepository } from './customer-reseller.repository';

@Module({
  imports: [WalletModule],
  controllers: [CustomerResellerController],
  providers: [CustomerResellerRepository, ConfigService],
})
export class CustomerResellerModule {}
