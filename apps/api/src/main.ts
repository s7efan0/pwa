import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Normally the browser only ever talks to the Vite dev server, which proxies
 * /api server-side — so CORS never comes into play. It does the moment the
 * phone or a preview build calls the API directly, hence localhost plus any
 * private-range LAN origin.
 */
function isAllowedOrigin(origin: string): boolean {
  return (
    /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin) ||
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      // No Origin header: same-origin, curl, or the service worker.
      if (!origin) return cb(null, true);
      cb(null, isAllowedOrigin(origin));
    },
  });
  // Bind on all interfaces so the phone can reach the API when it bypasses
  // the Vite proxy. Express already defaults to this; stated explicitly.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
