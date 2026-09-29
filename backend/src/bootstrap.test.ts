import { createHmac } from "node:crypto";

import { Body, Controller, Get, Module, Post } from "@nestjs/common";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("./config/db.js", () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(), end: vi.fn() },
}));

vi.mock("./modules/ai/clients/llm-client.js", () => ({
  createChatLlm: vi.fn(),
}));

vi.mock("./modules/whatsapp/services/whatsapp.service.js", () => ({
  processWebhook: vi.fn(async () => {}),
}));

const APP_SECRET = "test-app-secret";
vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify-token");

const { createApp } = await import("./bootstrap.js");
const { CommonModule } = await import("./common/common.module.js");
const { Public, Tenant } =
  await import("./common/decorators/auth.decorators.js");
const { signAuthToken } = await import("./modules/auth/utils/jwt.js");
const { processWebhook } =
  await import("./modules/whatsapp/services/whatsapp.service.js");

@Controller("nest-probe")
class ProbeController {
  @Public()
  @Get()
  ping() {
    return { from: "nest" };
  }

  @Public()
  @Post("echo")
  echo(@Body() body: unknown) {
    return { received: body };
  }

  @Get("tenant")
  tenant(@Tenant() tenantId: number) {
    return { tenantId };
  }
}

@Module({ imports: [CommonModule], controllers: [ProbeController] })
class ProbeModule {}

describe("ponte Nest + Express legado", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(ProbeModule);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.mocked(processWebhook).mockClear();
  });

  const http = () => app.getHttpServer();

  it("rota do legado continua respondendo (GET /health)", async () => {
    const res = await request(http()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("rota guardada do legado continua exigindo token (401)", async () => {
    const res = await request(http()).get("/api/orders");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("missing_token");
  });

  it("rota do Nest é servida quando o legado não a conhece", async () => {
    const res = await request(http()).get("/nest-probe");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ from: "nest" });
  });

  it("corpo JSON lido pelo legado chega ao controller do Nest", async () => {
    const res = await request(http()).post("/nest-probe/echo").send({ a: 1 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: { a: 1 } });
  });

  it("rota do Nest sem @Public() passa pelo guard global (401 sem token, 200 com)", async () => {
    const denied = await request(http()).get("/nest-probe/tenant");
    const token = signAuthToken({ userId: 1, tenantId: 8 });
    const ok = await request(http())
      .get("/nest-probe/tenant")
      .set("Authorization", `Bearer ${token}`);

    expect(denied.status).toBe(401);
    expect(ok.body).toEqual({ tenantId: 8 });
  });

  it("rota que ninguém conhece dá 404 no formato do projeto", async () => {
    const res = await request(http()).get("/nao-existe");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("route_not_found");
  });

  it("webhook assinado passa pela ponte com o rawBody do legado", async () => {
    const body = '{"object":"whatsapp_business_account",  "entry":[]}';
    const signature =
      "sha256=" + createHmac("sha256", APP_SECRET).update(body).digest("hex");

    const res = await request(http())
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signature)
      .send(body);

    expect(res.status).toBe(200);
    await vi.waitFor(() =>
      expect(processWebhook).toHaveBeenCalledWith({
        object: "whatsapp_business_account",
        entry: [],
      }),
    );
  });

  it("webhook com assinatura errada é recusado (403)", async () => {
    const res = await request(http())
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", "sha256=deadbeef")
      .send('{"entry":[]}');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("invalid_signature");
  });
});
