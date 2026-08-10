import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

export function setupSwagger(app: NestFastifyApplication): ReturnType<typeof SwaggerModule.createDocument> {
  const config = new DocumentBuilder()
    .setTitle('IPEasy Platform API')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'apikey' }, 'apikey')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  app.getHttpAdapter().get('/openapi.json', (_req, reply) => {
    reply.send(document);
  });
  return document;
}
