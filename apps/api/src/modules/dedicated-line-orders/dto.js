"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateDedicatedLineOrderDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CreateDedicatedLineOrderDto {
    skuCode;
    countryCode;
    quantity;
    durationDays;
    currency;
    idempotencyKey;
    regionCode;
    businessType;
}
exports.CreateDedicatedLineOrderDto = CreateDedicatedLineOrderDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Catalog SKU code, for example SV or ZB' }),
    __metadata("design:type", String)
], CreateDedicatedLineOrderDto.prototype, "skuCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateDedicatedLineOrderDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CreateDedicatedLineOrderDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], CreateDedicatedLineOrderDto.prototype, "durationDays", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateDedicatedLineOrderDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreateDedicatedLineOrderDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    __metadata("design:type", String)
], CreateDedicatedLineOrderDto.prototype, "regionCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Provider business code, only when the configured SKU contract requires it' }),
    __metadata("design:type", String)
], CreateDedicatedLineOrderDto.prototype, "businessType", void 0);
//# sourceMappingURL=dto.js.map