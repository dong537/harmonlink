"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertsModule = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../common/config/config.service");
const bark_alert_outbox_repository_1 = require("./bark-alert-outbox.repository");
const bark_notification_adapter_1 = require("./bark-notification.adapter");
const process_bark_inventory_alert_use_case_1 = require("./process-bark-inventory-alert.use-case");
let AlertsModule = class AlertsModule {
};
exports.AlertsModule = AlertsModule;
exports.AlertsModule = AlertsModule = __decorate([
    (0, common_1.Module)({
        providers: [config_service_1.ConfigService, bark_alert_outbox_repository_1.BarkAlertOutboxRepository, bark_notification_adapter_1.BarkNotificationAdapter, process_bark_inventory_alert_use_case_1.ProcessBarkInventoryAlertUseCase],
        exports: [bark_alert_outbox_repository_1.BarkAlertOutboxRepository, bark_notification_adapter_1.BarkNotificationAdapter, process_bark_inventory_alert_use_case_1.ProcessBarkInventoryAlertUseCase],
    })
], AlertsModule);
//# sourceMappingURL=alerts.module.js.map