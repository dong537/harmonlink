import { Controller, Get, Headers, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { Socket } from 'net';
import { prisma } from '@ipeasy/db';
import { env } from '../../common/config/env.schema';

interface SchemaDiagnosticReport {
  database: string;
  tableCount: number;
  tables: string[];
  appliedMigrations: string[];
  pendingMigrations: string[];
}

@Controller()
export class HealthController {
  @Get('health')
  health(@Res() reply: FastifyReply): void {
    reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  }

  @Get('ready')
  async ready(@Res() reply: FastifyReply): Promise<void> {
    const timestamp = new Date().toISOString();
    const checks = {
      db: await checkDb(),
      redis: await checkRedis(env.REDIS_URL),
    };
    const ok = checks.db.ok && checks.redis.ok;
    reply.status(ok ? 200 : 503).send({ status: ok ? 'ok' : 'error', timestamp, checks });
  }

  @Get('internal/schema-diagnostic')
  async schemaDiagnostic(
    @Headers('x-schema-diagnostic-token') token: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const expected = env.SCHEMA_DIAGNOSTIC_TOKEN;
    if (!expected) {
      reply.status(404).send({ reasonKey: 'not_found' });
      return;
    }
    if (token !== expected) {
      reply.status(403).send({ reasonKey: 'forbidden' });
      return;
    }
    reply.status(200).send(await readSchemaDiagnostic());
  }
}

async function readSchemaDiagnostic(): Promise<SchemaDiagnosticReport> {
  const [database] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at
  `;
  return {
    database: database?.current_database ?? '',
    tableCount: tables.length,
    tables: tables.map((row) => row.table_name),
    appliedMigrations: migrations.filter((row) => row.finished_at).map((row) => row.migration_name),
    pendingMigrations: migrations.filter((row) => !row.finished_at).map((row) => row.migration_name),
  };
}

async function checkDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'db_check_failed' };
  }
}

async function checkRedis(redisUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = new URL(redisUrl);
    const host = url.hostname;
    const port = Number(url.port || 6379);
    await pingTcp(host, port);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'redis_check_failed' };
  }
}

function pingTcp(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const cleanup = (): void => {
      socket.removeAllListeners();
      socket.destroy();
    };
    socket.setTimeout(1_000);
    socket.once('connect', () => {
      cleanup();
      resolve();
    });
    socket.once('timeout', () => {
      cleanup();
      reject(new Error('redis_timeout'));
    });
    socket.once('error', (error) => {
      cleanup();
      reject(error);
    });
    socket.connect(port, host);
  });
}
