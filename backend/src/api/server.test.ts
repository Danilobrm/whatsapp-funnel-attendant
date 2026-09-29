import { createHmac } from "node:crypto";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova a matriz de guardas do mount. Chamar o handler direto (o padrão dos
 * outros testes de controller) não pega uma rota montada sem guard: só o
 * roteador montado sabe se ele está lá.
 */
vi.mock("../config/db.js", () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(), end: vi.fn() },
}));

vi.mock("../modules/ai/clients/llm-client.js", () => ({
  createChatLlm: vi.fn(),
}));

vi.mock("../modules/whatsapp/services/whatsapp.service.js", () => ({
  processWebhook: vi.fn(async () => {}),
}));

const APP_SECRET = "test-app-secret";
const VERIFY_TOKEN = "test-verify-token";
vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
vi.stubEnv("WHATSAPP_VERIFY_TOKEN", VERIFY_TOKEN);

const { signAuthToken } = await import("../modules/auth/utils/jwt.js");
const { processWebhook } =
  await import("../modules/whatsapp/services/whatsapp.service.js");
const { createServer } = await import("./server.js");

const app = createServer();
const TOKEN = signAuthToken({ userId: 1, tenantId: 1 });

beforeEach(() => {
  vi.clearAllMocks();
});

const GUARDED: [string, string][] = [
  ["get", "/api/settings"],
  ["put", "/api/settings"],
  ["get", "/api/simulator/conversation"],
  ["delete", "/api/simulator/conversation"],
  ["post", "/api/simulator/messages"],
  ["get", "/api/simulator/cart"],
  ["get", "/api/simulator/customers"],
  ["post", "/api/simulator/customers"],
  ["get", "/api/orders"],
  ["get", "/api/orders/stream"],
  ["get", "/api/orders/1"],
  ["post", "/api/orders/1/transition"],
  ["post", "/api/orders/dev-sample"],
  ["get", "/api/dashboard"],
];

describe("rotas autenticadas", () => {
  it.each(GUARDED)("%s %s responde 401 sem token", async (method, path) => {
    const res = await (
      request(app) as unknown as Record<string, (p: string) => request.Test>
    )[method]!(path);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: "unauthorized",
      code: "missing_token",
    });
  });

  it("GET /api/settings deixa passar com token válido", async () => {
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${TOKEN}`);

    expect(res.status).not.toBe(401);
  });

  it("responde 401 com code e SEM message em header malformado", async () => {
    const res = await request(app)
      .get("/api/settings")
      .set("Authorization", "Bearer lixo");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_token");
    expect(res.body).not.toHaveProperty("message");
  });

  it("POST /api/simulator/messages sem texto responde 422 text_required", async () => {
    const res = await request(app)
      .post("/api/simulator/messages")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ text: "  " });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "text_required", field: "text" });
  });
});

describe("simulador — clientes de teste", () => {
  const auth = { Authorization: `Bearer ${TOKEN}` };

  it("POST /api/simulator/customers sem nome responde 422 name_required", async () => {
    const res = await request(app)
      .post("/api/simulator/customers")
      .set(auth)
      .send({ name: " ", phone: "5561990000001" });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "name_required", field: "name" });
  });

  it("POST /api/simulator/customers com telefone inválido responde 422 phone_invalid", async () => {
    const res = await request(app)
      .post("/api/simulator/customers")
      .set(auth)
      .send({ name: "Ana", phone: "12" });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "phone_invalid", field: "phone" });
  });

  it("contactId inválido responde 422 invalid_contact, sem chegar ao banco", async () => {
    const res = await request(app)
      .get("/api/simulator/conversation?contactId=../../etc")
      .set(auth);

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: "invalid_contact",
      field: "contactId",
    });
  });
});

describe("cardápio em link (rotas públicas, autenticadas pelo token da URL)", () => {
  it("GET /api/public/menu/:token com token inválido responde 401 invalid_menu_link, sem message", async () => {
    const res = await request(app).get("/api/public/menu/lixo");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      status: "unauthorized",
      code: "invalid_menu_link",
    });
    expect(res.body).not.toHaveProperty("message");
  });

  it("POST /api/public/cart/:token com token inválido responde 401 sem gravar nada", async () => {
    const res = await request(app)
      .post("/api/public/cart/lixo")
      .send({ items: [{ itemId: 1, quantity: 1 }] });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_menu_link");
  });

  // O token do PAINEL (JWT) não é um código de link: nem chega ao banco.
  it("um token do painel NÃO abre o cardápio público", async () => {
    const res = await request(app).get(`/api/public/menu/${TOKEN}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_menu_link");
  });

  it("um código bem formado mas desconhecido responde 401 invalid_menu_link", async () => {
    const res = await request(app).get("/api/public/menu/abcdEFGH1234");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_menu_link");
  });

  it("não exige Authorization (o cliente final não tem login)", async () => {
    const res = await request(app).get("/api/public/menu/lixo");

    expect(res.body.code).not.toBe("missing_token");
  });

  it("limita chamadas por IP (429 rate_limited)", async () => {
    let last = 0;
    for (let i = 0; i < 25; i += 1) {
      last = (await request(app).post("/api/public/cart/lixo").send({})).status;
    }

    expect(last).toBe(429);
  });
});

describe("pedidos", () => {
  it("POST /api/orders/:id/transition com status inválido responde 422", async () => {
    const res = await request(app)
      .post("/api/orders/1/transition")
      .set("Authorization", `Bearer ${TOKEN}`)
      .send({ to: "lixo" });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: "invalid_status" });
  });

  it("POST /api/orders/dev-sample NÃO existe em produção (404)", async () => {
    const { env } = await import("../config/env.js");
    const original = env.nodeEnv;
    env.nodeEnv = "production";
    try {
      const prodApp = createServer();
      const res = await request(prodApp)
        .post("/api/orders/dev-sample")
        .set("Authorization", `Bearer ${TOKEN}`);
      expect(res.status).toBe(404);
    } finally {
      env.nodeEnv = original;
    }
  });
});

describe("rotas públicas", () => {
  it("GET /health responde sem token (é o healthcheck do compose)", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("POST /api/auth/login é público e recusa credencial inválida com 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ninguem@admin.com", password: "errada" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("invalid_credentials");
  });

  it("GET /api/auth/me exige token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });
});

describe("webhook do WhatsApp", () => {
  it("GET devolve o challenge quando o verify_token confere", async () => {
    const res = await request(app).get("/webhooks/whatsapp").query({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "12345",
    });

    expect(res.status).toBe(200);
    expect(res.text).toBe("12345");
  });

  it("GET recusa verify_token errado com 403", async () => {
    const res = await request(app).get("/webhooks/whatsapp").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "errado",
      "hub.challenge": "12345",
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("invalid_verify_token");
  });

  it("POST assinado sobre o corpo cru responde 200 e processa", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [],
    });
    const signature = `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(processWebhook).toHaveBeenCalledWith({
      object: "whatsapp_business_account",
      entry: [],
    });
  });

  it("POST sem assinatura válida responde 403 e NÃO processa", async () => {
    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", "sha256=deadbeef")
      .send({ object: "whatsapp_business_account", entry: [] });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("invalid_signature");
    expect(processWebhook).not.toHaveBeenCalled();
  });
});
