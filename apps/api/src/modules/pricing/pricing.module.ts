import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { PricingRepository } from './pricing.repository';
import { PricingController } from './pricing.controller';
import { QuoteUseCase } from './use-cases/quote.use-case';
import { ResourcesModule } from '../resources/resources.module';

@Module({
  imports: [ResourcesModule],
  providers: [PricingRepository, QuoteUseCase, ConfigService],
  controllers: [PricingController],
  exports: [PricingRepository, QuoteUseCase],
})
export class PricingModule {}
