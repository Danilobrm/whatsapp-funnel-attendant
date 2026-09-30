import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";

import { Auth, Tenant } from "../../../common/decorators/auth.decorators.js";
import { env } from "../../../config/env.js";
import { InvalidOrderError } from "../errors/order.errors.js";
import { OrderEvents } from "../events/order.events.js";
import { OrderService } from "../services/order.service.js";
import { parseTransitionInput } from "../utils/order.parse.js";

import type { RequestAuth } from "../../auth/types/auth.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Request, Response } from "express";

/** Proxies (nginx, load balancer) derrubam conexão ociosa; o ping a mantém viva. */
export const STREAM_HEARTBEAT_MS = 25_000;

function idParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new InvalidOrderError("invalid_id", "id");
  }
  return id;
}

@Controller("api/orders")
export class OrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly events: OrderEvents,
  ) {}

  @Get()
  async getOrders(@Tenant() tenantId: TenantId) {
    const orders = await this.orders.listBoard(tenantId);
    return { orders };
  }

  /**
   * Server-Sent Events do quadro de pedidos. Autenticado pelo guard global
   * (header Bearer): o painel usa `fetch` com stream, não `EventSource`,
   * justamente para não pôr o token na URL (que vai parar em log de proxy).
   *
   * `@Res()` sem `passthrough` e escrita manual, de propósito: o `@Sse()` do
   * Nest muda o formato de fio. Síncrono — nada aqui rejeita depois do
   * `flushHeaders`; um erro depois de começar o stream não teria mais como
   * virar JSON de erro.
   *
   * Declarado ANTES de `:id`, senão "stream" seria lido como id.
   */
  @Get("stream")
  stream(
    @Tenant() tenantId: TenantId,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // nginx: não bufferizar a resposta (senão os eventos chegam em lote).
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(": connected\n\n");

    const unsubscribe = this.events.subscribeOrders(tenantId, (event) => {
      res.write(
        `event: ${event.type}\ndata: ${JSON.stringify(event.order)}\n\n`,
      );
    });
    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, STREAM_HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }

  /**
   * Pedido de teste: em produção a rota "não existe" (404, não 403). Decidido
   * na requisição — e não ao montar a rota — para o ambiente poder ser
   * trocado em teste sem recarregar o módulo.
   */
  @Post("dev-sample")
  async postDevSample(@Auth() auth: RequestAuth) {
    if (env.nodeEnv === "production") throw new NotFoundException();

    const order = await this.orders.createSampleOrder(
      auth.tenantId,
      auth.userId,
    );
    return { order };
  }

  @Get(":id")
  async getOrderById(@Tenant() tenantId: TenantId, @Param("id") id: string) {
    const order = await this.orders.getOrder(tenantId, idParam(id));
    return { order };
  }

  // 200, não o 201 padrão do Nest: a transição não cria um recurso.
  @HttpCode(200)
  @Post(":id/transition")
  async postTransition(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const order = await this.orders.transitionOrder(
      tenantId,
      idParam(id),
      parseTransitionInput(body),
    );
    return { order };
  }
}
