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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DedicatedLineOrdersController = void 0;
const common_1 = require("@nestjs/common");
const current_context_decorator_1 = require("../../common/auth/current-context.decorator");
const guards_1 = require("../../common/auth/guards");
const create_dedicated_line_order_use_case_1 = require("./create-dedicated-line-order.use-case");
const dto_1 = require("./dto");
let DedicatedLineOrdersController = class DedicatedLineOrdersController {
    createOrder;
    constructor(createOrder) {
        this.createOrder = createOrder;
    }
    create(ctx, dto) {
        return this.createOrder.execute(ctx, dto);
    }
};
exports.DedicatedLineOrdersController = DedicatedLineOrdersController;
__decorate([
    (0, common_1.Post)(),
    (0, guards_1.RequireUser)(),
    __param(0, (0, current_context_decorator_1.CurrentContext)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.CreateDedicatedLineOrderDto]),
    __metadata("design:returntype", void 0)
], DedicatedLineOrdersController.prototype, "create", null);
exports.DedicatedLineOrdersController = DedicatedLineOrdersController = __decorate([
    (0, common_1.Controller)('dedicated-line-orders'),
    __metadata("design:paramtypes", [create_dedicated_line_order_use_case_1.CreateDedicatedLineOrderUseCase])
], DedicatedLineOrdersController);
//# sourceMappingURL=dedicated-line-orders.controller.js.map