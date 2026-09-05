import { AuthenticatedContext } from '../../common/auth/auth-context';
import { CreateDedicatedLineOrderUseCase } from './create-dedicated-line-order.use-case';
import { CreateDedicatedLineOrderDto } from './dto';
export declare class DedicatedLineOrdersController {
    private readonly createOrder;
    constructor(createOrder: CreateDedicatedLineOrderUseCase);
    create(ctx: AuthenticatedContext, dto: CreateDedicatedLineOrderDto): Promise<import("./create-dedicated-line-order.use-case").CreateDedicatedLineOrderResult>;
}
