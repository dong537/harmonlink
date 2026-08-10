import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { AppExceptionFilter } from './common/errors/exception-filter';
import { env } from './common/config/env.schema';
import { ConfigGuard } from './common/config/config-guard';
import { CORS_ALLOWED_HEADERS, parseCorsOrigins } from './common/config/cors';
import { setupSwagger } from './modules/openapi/openapi-setup';
import { configureGlobalPrefix } from './common/http/res-static-compat';

async function bootstrap(): Promise<void> {
  ConfigGuard.verify();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  configureGlobalPrefix(app);
  const corsOrigins = parseCorsOrigins();
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [...CORS_ALLOWED_HEADERS],
    });
  }

  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new AppExceptionFilter());

  setupSwagger(app);

  await app.listen(env.PORT, '0.0.0.0');
  console.info(`API listening on port ${env.PORT}`);
}

void bootstrap();
