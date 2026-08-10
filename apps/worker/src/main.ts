import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ConfigGuard,
  FulfillmentModule,
  FulfillmentRepository,
  FulfillStaticProxyUseCase,
  ProvidersRepository,
  ResourcesModule,
  SyncInventoryUseCase,
  env,
} from '@ipeasy/api/worker';
import { FulfillmentWorker } from './fulfillment-worker';
import { InventorySyncWorker } from './inventory-sync-worker';

@Module({
  imports: [FulfillmentModule, ResourcesModule],
})
class WorkerAppModule {}

async function bootstrap(): Promise<void> {
  ConfigGuard.verify();
  const app = await NestFactory.createApplicationContext(WorkerAppModule, { bufferLogs: true });
  const worker = new FulfillmentWorker(
    app.get(FulfillmentRepository),
    app.get(FulfillStaticProxyUseCase),
    {
      executionEnabled: env.PROVIDER_FULFILLMENT_EXECUTION_ENABLED === 'true',
      batchSize: env.WORKER_FULFILLMENT_BATCH_SIZE,
    },
  );
  const inventoryWorker = new InventorySyncWorker(
    app.get(ProvidersRepository),
    app.get(SyncInventoryUseCase),
    { enabled: env.PROVIDER_INVENTORY_SYNC_ENABLED === 'true' },
  );

  console.info(`Fulfillment worker started with interval ${env.WORKER_FULFILLMENT_POLL_INTERVAL_MS}ms`);
  console.info(`Inventory sync worker started with interval ${env.WORKER_INVENTORY_SYNC_INTERVAL_MS}ms`);
  await worker.poll();
  await inventoryWorker.poll();
  const timer = setInterval(() => {
    void worker.poll();
  }, env.WORKER_FULFILLMENT_POLL_INTERVAL_MS);
  const inventoryTimer = setInterval(() => {
    void inventoryWorker.poll();
  }, env.WORKER_INVENTORY_SYNC_INTERVAL_MS);

  const shutdown = async (): Promise<void> => {
    globalThis.clearInterval(timer);
    globalThis.clearInterval(inventoryTimer);
    await app.close();
    process.exit(0);
  };

  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}

void bootstrap();
