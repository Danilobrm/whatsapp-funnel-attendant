import { Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { UnauthorizedError } from "../../modules/auth/errors/auth.errors.js";
import { readBearerAuth } from "../../modules/auth/utils/bearer.js";
import { IS_PUBLIC_KEY } from "../decorators/auth.decorators.js";

import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Guard GLOBAL (ver `CommonModule`): exige Bearer válido em todo handler que
 * não esteja marcado `@Public()`. Erros saem como `UnauthorizedError` e o
 * `AllExceptionsFilter` os traduz — o guard não monta resposta.
 *
 * `@Inject(Reflector)` explícito: o esbuild do `tsx`/Vitest não emite
 * `design:paramtypes`, então a injeção por tipo não funcionaria nos testes.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const result = readBearerAuth(req.headers.authorization);

    if (result.kind === "absent") throw new UnauthorizedError("missing_token");
    if (result.kind === "error") throw result.error;

    req.auth = result.auth;
    return true;
  }
}
