import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { createCorsOriginHandler } from './common/cors-origin';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (
    process.env.FRONTEND_URLS ||
    'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const uploadRoot = process.env.UPLOAD_ROOT || join(process.cwd(), 'uploads');

  if (!existsSync(uploadRoot)) {
    mkdirSync(uploadRoot, { recursive: true });
  }

  app.use('/api/uploads', express.static(uploadRoot));
  app.enableCors({
    origin: createCorsOriginHandler(allowedOrigins),
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );
  (app.getHttpAdapter() as any).getInstance().set('trust proxy', true);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
