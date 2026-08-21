import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

export interface RenewDedicatedLineInput {
  lineId: string;
  durationDays: number;
  idempotencyKey: string;
}

export interface RenewDedicatedLineResult {
  orderId: string;
  totalPrice: string;
  currency: string;
}

@Injectable()
export class RenewDedicatedLineUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: RenewDedicatedLineInput): Promise<RenewDedicatedLineResult> {
    const { lineId, durationDays, idempotencyKey } = input;

    // 查找专线和 SKU
    const line = await this.prisma.dedicated_lines.findUnique({
      where: { id: lineId },
      include: { sku: true },
    });

    if (!line) {
      throw new AppError(ErrorCode.NOT_FOUND, 'dedicated_line_not_found', 404);
    }

    // 计算续费金额（简化版）
    const dailyRate = 10;
    const unitPrice = dailyRate * durationDays;
    const totalPrice = unitPrice;

    // 创建续费订单
    const order = await this.prisma.dedicated_line_orders.create({
      data: {
        siteId: line.siteId,
        tenantId: line.tenantId,
        userId: line.userId,
        skuId: line.skuId,
        skuCode: line.sku.code,
        skuName: line.sku.name,
        countryCode: line.countryCode,
        regionCode: null,
        businessType: line.protocol,
        durationDays,
        quantity: 1,
        unitPrice,
        totalPrice,
        currency: 'CNY',
        priceSource: 'renewal',
        contractVersion: 1,
        idempotencyKey,
      },
    });

    return {
      orderId: order.id,
      totalPrice: order.totalPrice.toString(),
      currency: order.currency,
    };
  }
}
