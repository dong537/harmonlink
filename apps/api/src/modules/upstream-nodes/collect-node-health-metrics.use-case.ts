import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface HealthMetrics {
  nodeId: string;
  healthScore: number;
  latency?: number;
  uptime?: number;
  errorRate?: number;
  lastCheckedAt: Date;
}

@Injectable()
export class CollectNodeHealthMetricsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(nodeId: string): Promise<HealthMetrics> {
    // 获取控制节点信息
    const node = await this.prisma.control_nodes.findUnique({
      where: { id: nodeId },
    });

    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // 获取最近的健康观测记录
    const recentObs = await this.prisma.control_node_health_observations.findMany({
      where: {
        nodeId: nodeId
      },
      orderBy: { observedAt: 'desc' },
      take: 10,
    });

    // 计算平均健康分数
    let healthScore = 100;
    let latency: number | undefined;
    let errorRate: number | undefined;

    if (recentObs.length > 0) {
      // 基于 reachable 字段计算健康分数
      const reachableCount = recentObs.filter(obs => obs.reachable).length;
      healthScore = (reachableCount / recentObs.length) * 100;

      // 计算平均延迟（使用 latencyMs 字段）
      const validLatencies = recentObs
        .map(obs => obs.latencyMs)
        .filter((l): l is number => l !== null && l !== undefined);
      if (validLatencies.length > 0) {
        latency = validLatencies.reduce((sum, l) => sum + l, 0) / validLatencies.length;
      }

      // 计算错误率
      const errorCount = recentObs.filter(obs => !obs.reachable).length;
      errorRate = (errorCount / recentObs.length) * 100;
    }

    // TODO: 保存健康指标快照 - 需要在 schema 中添加 node_health_metrics 表
    // await this.prisma.node_health_metrics.create({
    //   data: {
    //     nodeId,
    //     healthScore,
    //     latency,
    //     errorRate,
    //     collectedAt: new Date(),
    //   },
    // });

    return {
      nodeId,
      healthScore: Math.round(healthScore),
      latency,
      uptime: undefined, // 需要从外部系统获取
      errorRate,
      lastCheckedAt: new Date(),
    };
  }
}
