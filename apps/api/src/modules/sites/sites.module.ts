import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { SitesController } from './sites.controller';
import { SitesRepository } from './sites.repository';
import { UpdateSiteDomainUseCase } from './update-site-domain.use-case';

@Module({
  controllers: [SitesController],
  providers: [ConfigService, SitesRepository, UpdateSiteDomainUseCase],
  exports: [SitesRepository],
})
export class SitesModule {}
