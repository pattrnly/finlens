import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import dns from 'node:dns';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { PlainInterceptor } from './common/plain.interceptor';

// Windows often hangs on Google IPv6 (Gemini "fetch failed" / Test never returns).
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true, bodyLimit: 20 * 1024 * 1024 }),
  );
  const origin = process.env.CLIENT_URL ?? 'http://localhost:5173';
  await app.register(cors as never, {
    origin,
    credentials: true,
  });
  await app.register(helmet as never, { contentSecurityPolicy: false });
  await app.register(cookie as never);
  await app.register(multipart as never, {
    limits: { fileSize: 15 * 1024 * 1024 },
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalInterceptors(new PlainInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: false,
    }),
  );
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
