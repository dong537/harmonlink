import { Module } from '@nestjs/common';
import { ConfigService } from '../../common/config/config.service';
import { BarkAlertOutboxRepository } from './bark-alert-outbox.repository';
import { BarkNotificationAdapter } from './bark-notification.adapter';
import { ProcessBarkInventoryAlertUseCase } from './process-bark-inventory-alert.use-case';

@Module({
  providers: [ConfigService, BarkAlertOutboxRepository, BarkNotificationAdapter, ProcessBarkInventoryAlertUseCase],
  exports: [BarkAlertOutboxRepository, BarkNotificationAdapter, ProcessBarkInventoryAlertUseCase],
})
export class AlertsModule {}
