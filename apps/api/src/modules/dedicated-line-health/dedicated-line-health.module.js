"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineHealthModule = void 0;
const common_1 = require("@nestjs/common");
const dedicated_line_projections_module_1 = require("../dedicated-line-projections/dedicated-line-projections.module");
const control_node_health_use_case_1 = require("./control-node-health.use-case");
const list_recommendations_use_case_1 = require("./list-recommendations.use-case");
let DedicatedLineHealthModule = class DedicatedLineHealthModule {
};
exports.DedicatedLineHealthModule = DedicatedLineHealthModule;
exports.DedicatedLineHealthModule = DedicatedLineHealthModule = __decorate([
    (0, common_1.Module)({ imports: [dedicated_line_projections_module_1.DedicatedLineProjectionsModule], providers: [control_node_health_use_case_1.ProcessControlNodeHealthUseCase, list_recommendations_use_case_1.ListDedicatedLineRecommendationsUseCase], exports: [control_node_health_use_case_1.ProcessControlNodeHealthUseCase, list_recommendations_use_case_1.ListDedicatedLineRecommendationsUseCase] })
], DedicatedLineHealthModule);
//# sourceMappingURL=dedicated-line-health.module.js.map