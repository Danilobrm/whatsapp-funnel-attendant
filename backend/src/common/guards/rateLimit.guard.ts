import { Inject, Injectable, Optional } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RateLimitedError } from "../../modules/menulink/errors/menuLink.errors.js";
import { RATE_LIMIT_KEY } from "../decorators/auth.decorators.js";
import { SlidingWindowLimiter } from "../rate-limit/slidingWindow.js";

import type { RateLimitOptions } from "../decorators/auth.decorators.js";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/** Token do relógio injetável (só o teste usa). */
export const RATE_LIMIT_NOW = Symbol("RATE_LIMIT_NOW");

/**
 * Aplica `@RateLimit({ windowMs, max })` por IP. Cada handler ganha o seu
 * próprio balde (como os dois `createRateLimiter` do legado: GET 60/min e POST
 * 20/min não se somam). Sem `@RateLimit` na rota, deixa passar.
 *
 * Use com `@UseGuards(RateLimitGuard)`: roda ANTES do handler, então antes de
 * qualquer consulta ao banco.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiters = new Map<string, SlidingWindowLimiter>();

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(RATE_LIMIT_NOW) private readonly now?: () => number,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) return true;

    const bucket = `${context.getClass().name}.${context.getHandler().name}`;
    let limiter = this.limiters.get(bucket);
    if (!limiter) {
      limiter = new SlidingWindowLimiter({ ...options, now: this.now });
      this.limiters.set(bucket, limiter);
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (!limiter.allow(req.ip ?? "unknown")) throw new RateLimitedError();
    return true;
  }
}
