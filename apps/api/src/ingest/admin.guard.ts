import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * The admin routes trigger upstream imports that spend a shared 30/min rate
 * budget, so they must not be open to anything that can reach the server —
 * and binding to 0.0.0.0 for phone testing means the whole LAN can.
 *
 * Fails closed: with no ADMIN_TOKEN configured nothing is allowed through,
 * rather than silently leaving the routes public.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_TOKEN');
    if (!expected) {
      this.logger.error('ADMIN_TOKEN is not set — refusing admin request');
      throw new UnauthorizedException('Admin API is not configured');
    }

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-admin-token');
    if (provided !== expected) {
      throw new UnauthorizedException('Invalid admin token');
    }
    return true;
  }
}
