import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedContext } from '../../common/auth/auth-context';
import { CurrentContext } from '../../common/auth/current-context.decorator';
import { RequireAuth } from '../../common/auth/guards';
import {
  DedicatedLineOrderAdminListQuery,
} from './dedicated-line-order-admin.repository';
import { DedicatedLineOrderAdminUseCase } from './dedicated-line-order-admin.use-case';

@Controller('admin/dedicated-line-orders')
@RequireAuth()
export class DedicatedLineOrderAdminController {
  constructor(private readonly useCase: DedicatedLineOrderAdminUseCase) {}

  @Get()
  list(
    @CurrentContext() ctx: AuthenticatedContext,
    @Query() query: DedicatedLineOrderAdminListQuery,
  ) {
    return this.useCase.list(ctx, query);
  }

  @Get(':id')
  get(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') orderId: string,
  ) {
    return this.useCase.get(ctx, orderId);
  }

  @Post(':id/retry')
  retry(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') orderId: string,
    @Body() _body?: unknown,
  ) {
    return this.useCase.retry(ctx, orderId);
  }

  @Post(':id/retry-fulfillment')
  retryFulfillment(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') orderId: string,
    @Body() _body?: unknown,
  ) {
    return this.useCase.retryFulfillment(ctx, orderId);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') orderId: string,
    @Body() _body?: unknown,
  ) {
    return this.useCase.cancel(ctx, orderId);
  }

  @Post(':id/refund')
  refund(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') orderId: string,
    @Body() _body?: unknown,
  ) {
    return this.useCase.refund(ctx, orderId);
  }

  @Post(':id/manual-complete')
  manualComplete(
    @CurrentContext() ctx: AuthenticatedContext,
    @Param('id') orderId: string,
    @Body() _body?: unknown,
  ) {
    return this.useCase.manualComplete(ctx, orderId);
  }
}
