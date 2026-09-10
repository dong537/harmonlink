import { Controller, Get, Module } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { AppExceptionFilter } from '../errors/exception-filter';
import { EnvelopeInterceptor } from '../interceptors/envelope.interceptor';
import {
  createLegacyApiV1RewriteUrl,
  isLegacyApiV1Request,
  legacyApiV1RequestPath,
  resolveLegacyApiV1Alias,
} from './legacy-api-v1';

describe('legacy /api/v1 transport compatibility', () => {
  it('does not rewrite routes owned by compatibility controllers', () => {
    expect(resolveLegacyApiV1Alias('GET', '/api/v1/orders?page=2&limit=10')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('GET', '/api/v1/notifications?read=false')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('PATCH', '/api/v1/notifications/n-1/read')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('POST', '/api/v1/tickets/t-1/reply')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('PATCH', '/api/v1/tickets/t-1/close')).toBeUndefined();
  });

  it('does not rewrite routes outside the explicit method and path allowlist', () => {
    expect(resolveLegacyApiV1Alias('POST', '/api/v1/orders')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('GET', '/api/v1/auth/register')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('POST', '/api/v1/users/change-password')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('GET', '/api/v1/dedicated/locations')).toBeUndefined();
    expect(resolveLegacyApiV1Alias('GET', '/api/orders')).toBeUndefined();
  });

  it('returns the original URL when the compatibility switch is disabled', () => {
    const rewrite = createLegacyApiV1RewriteUrl({ enabled: false });

    expect(rewrite({ method: 'GET', url: '/api/v1/orders?page=1' })).toBe('/api/v1/orders?page=1');
  });

  it('keeps compatibility controller paths intact in a Fastify routing probe', async () => {
    const server = fastify({ rewriteUrl: createLegacyApiV1RewriteUrl({ enabled: true }) });
    server.get('/api/v1/orders', (request, reply) => {
      reply.send({
        url: request.url,
        originalUrl: (request.raw as typeof request.raw & { originalUrl?: string }).originalUrl,
      });
    });
    server.get('/api/v1/auth/register', (_request, reply) => {
      reply.send({ route: 'legacy-register' });
    });

    const compatibilityRoute = await server.inject('/api/v1/orders?page=2');
    expect(compatibilityRoute.statusCode).toBe(200);
    expect(compatibilityRoute.json()).toEqual({
      url: '/api/v1/orders?page=2',
      originalUrl: '/api/v1/orders?page=2',
    });

    const untouched = await server.inject('/api/v1/auth/register');
    expect(untouched.statusCode).toBe(200);
    expect(untouched.json()).toEqual({ route: 'legacy-register' });

    await server.close();
  });

  it('detects legacy requests from Fastify raw.originalUrl after rewrite', () => {
    const request = {
      url: '/api/orders?page=2',
      raw: {
        url: '/api/orders?page=2',
        originalUrl: '/api/v1/orders?page=2',
      },
    };

    expect(isLegacyApiV1Request(request)).toBe(true);
    expect(legacyApiV1RequestPath(request)).toBe('/api/v1/orders');
  });

  it('does not classify a canonical request as legacy when raw URLs are canonical too', () => {
    const request = {
      url: '/api/orders?page=2',
      originalUrl: '/api/orders?page=2',
      raw: { url: '/api/orders?page=2', originalUrl: '/api/orders?page=2' },
    };

    expect(isLegacyApiV1Request(request)).toBe(false);
    expect(legacyApiV1RequestPath(request)).toBe('/api/orders');
  });

  it('keeps direct Nest compatibility success and error responses on the raw legacy contract', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [LegacyAliasProbeModule] }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({
        rewriteUrl: createLegacyApiV1RewriteUrl({ enabled: true }),
      }),
    );
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    app.useGlobalFilters(new AppExceptionFilter());

    try {
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      const request = supertest(app.getHttpServer());

      const success = await request.get('/api/v1/orders?page=2');
      expect(success.status).toBe(200);
      expect(success.body).toEqual({ ok: true });

      const canonical = await request.get('/api/orders?page=2');
      expect(canonical.status).toBe(200);
      expect(canonical.body).toMatchObject({ code: 0, msg: 'success', data: { ok: true } });
      expect(canonical.body.requestId).toBeDefined();

      const failure = await request.get('/api/v1/notifications/unread-count');
      expect(failure.status).toBe(422);
      expect(failure.body).toMatchObject({
        statusCode: 422,
        message: 'notification_backend_unavailable',
        errorCode: ErrorCode.UPSTREAM_ERROR,
        path: '/api/v1/notifications/unread-count',
      });
      expect(failure.body).not.toHaveProperty('requestId');
    } finally {
      await app.close();
    }
  });
});

@Controller('v1/orders')
class LegacyOrdersProbeController {
  @Get()
  list(): { ok: boolean } {
    return { ok: true };
  }
}

@Controller('orders')
class CanonicalOrdersProbeController {
  @Get()
  list(): { ok: boolean } {
    return { ok: true };
  }
}

@Controller('v1/notifications')
class LegacyNotificationsProbeController {
  @Get('unread-count')
  unreadCount(): never {
    throw new AppError(ErrorCode.UPSTREAM_ERROR, 'notification_backend_unavailable', 422);
  }
}

@Module({
  controllers: [LegacyOrdersProbeController, CanonicalOrdersProbeController, LegacyNotificationsProbeController],
})
class LegacyAliasProbeModule {}
