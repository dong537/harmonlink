import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface NodeWithCapacity {
  nodeId: string;
  nodeName: string;
  totalCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
  utilizationRate: number;
}

@Injectable()
export class FindNodesWithCapacityUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(filters?: {
    minAvailable?: number;
    maxUtilization?: number;
    region?: string;
    limit?: number;
  }): Promise<NodeWithCapacity[]> {
    const nodes = await this.prisma.control_nodes.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        _count: {
          select: { placementNodes: true },
        },
      },
      take: filters?.limit || 100,
    });

    const nodesWithCapacity: NodeWithCapacity[] = nodes.map((node) => {
      const totalCapacity = node.capacityUnits;
      const usedCapacity = node.allocatedUnits;
      const availableCapacity = totalCapacity - usedCapacity;
      const utilizationRate = totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0;

      return {
        nodeId: node.id,
        nodeName: node.name,
        totalCapacity,
        usedCapacity,
        availableCapacity,
        utilizationRate,
      };
    });

    // 应用过滤条件
    let filtered = nodesWithCapacity;

    if (filters?.minAvailable !== undefined) {
      filtered = filtered.filter(n => n.availableCapacity >= filters.minAvailable!);
    }

    if (filters?.maxUtilization !== undefined) {
      filtered = filtered.filter(n => n.utilizationRate <= filters.maxUtilization!);
    }

    // 按可用容量降序排序
    return filtered.sort((a, b) => b.availableCapacity - a.availableCapacity);
  }
}
