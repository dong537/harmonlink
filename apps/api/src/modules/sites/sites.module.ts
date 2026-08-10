import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesRepository } from './sites.repository';

@Module({
  controllers: [SitesController],
  providers: [SitesRepository],
  exports: [SitesRepository],
})
export class SitesModule {}
