import { InvalidOrderError } from "../errors/order.errors.js";
import { subscribeOrders } from "../events/order.events.js";
import {
  createSampleOrder,
  getOrder,
  listBoard,
  parseTransitionInput,
  transitionOrder,
} from "../services/order.service.js";
import { authOf, tenantOf } from "../../../api/utils/authContext.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

import type { Request, RequestHandler } from "express";

/** Proxies (nginx, load balancer) derrubam conexão ociosa; o ping a mantém viva. */
export const STREAM_HEARTBEAT_MS = 25_000;

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new InvalidOrderError("invalid_id", "id");
  }
  return id;
}

export const getOrders = asyncHandler(async (req, res) => {
  const orders = await listBoard(tenantOf(req));
  res.json({ orders });
});

export const getOrderById = asyncHandler(async (req, res) => {
  const order = await getOrder(tenantOf(req), idParam(req));
  res.json({ order });
});

export const postTransition = asyncHandler(async (req, res) => {
  const tenantId = tenantOf(req);
  const id = idParam(req);
  const order = await transitionOrder(
    tenantId,
    id,
    parseTransitionInput(req.body),
  );
  res.json({ order });
});

export const postDevSample = asyncHandler(async (req, res) => {
  const auth = authOf(req);
  const order = await createSampleOrder(auth.tenantId, auth.userId);
  res.status(201).json({ order });
});

/**
 * Server-Sent Events do quadro de pedidos. Autenticado pelo `requireAuth` do
 * mount (header Bearer): o painel usa `fetch` com stream, não `EventSource`,
 * justamente para não pôr o token na URL (que vai parar em log de proxy).
 *
 * Síncrono de propósito — nada aqui rejeita depois do `flushHeaders`; um
 * erro depois de começar o stream não teria mais como virar JSON de erro.
 */
export const getOrderStream: RequestHandler = (req, res) => {
  const tenantId = tenantOf(req);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // nginx: não bufferizar a resposta (senão os eventos chegam em lote).
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");

  const unsubscribe = subscribeOrders(tenantId, (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.order)}\n\n`);
  });
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, STREAM_HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};
