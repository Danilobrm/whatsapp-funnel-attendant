import { Catch, HttpException } from "@nestjs/common";

import { logUnhandledError, mapError } from "../http/errorMapping.js";

import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

/**
 * Adaptador do Nest para o mapa único em `common/http/errorMapping`. Nenhum
 * erro de domínio é decidido aqui — só a tradução para o `res`.
 *
 * `HttpException` é o que o PRÓPRIO Nest lança (rota inexistente, corpo
 * inválido…); sem tratá-la um 404 viraria 500. O status é preservado e o
 * corpo segue o formato do projeto, sem `message` do framework.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    // Resposta já em andamento (SSE): não dá para mudar status nem corpo.
    if (res.headersSent) {
      res.end();
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({
        status: status === 404 ? "not_found" : "error",
        code: status === 404 ? "route_not_found" : "http_error",
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    const mapped = mapError(exception);
    if (mapped.unhandled) logUnhandledError(exception);
    res.status(mapped.status).json(mapped.body);
  }
}
