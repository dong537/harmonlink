"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogModule = void 0;
const common_1 = require("@nestjs/common");
const catalog_controller_1 = require("./catalog.controller");
const catalog_repository_1 = require("./catalog.repository");
const domain_1 = require("./domain");
let CatalogModule = class CatalogModule {
};
exports.CatalogModule = CatalogModule;
exports.CatalogModule = CatalogModule = __decorate([
    (0, common_1.Module)({
        controllers: [catalog_controller_1.CatalogController],
        providers: [
            catalog_repository_1.CatalogRepository,
            {
                provide: domain_1.SkuQuoteUseCase,
                inject: [catalog_repository_1.CatalogRepository],
                useFactory: (repository) => new domain_1.SkuQuoteUseCase(repository),
            },
        ],
        exports: [catalog_repository_1.CatalogRepository, domain_1.SkuQuoteUseCase],
    })
], CatalogModule);
//# sourceMappingURL=catalog.module.js.map