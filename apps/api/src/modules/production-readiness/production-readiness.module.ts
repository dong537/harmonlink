import { Module } from '@nestjs/common';

// Production Readiness 模块：用于生产环境就绪检查
// 包括健康检查、配置验证、依赖检查等

@Module({
  providers: [],
  exports: [],
})
export class ProductionReadinessModule {}
