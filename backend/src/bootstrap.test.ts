import { Body, Controller, Get, Module, Post } from "@nestjs/common";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./config/db.js", () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  pool: { connect: vi.fn(), end: vi.fn() },
}));

const { createApp } = await import("./bootstrap.js");
const { CommonModule } = await import("./common/common.module.js");
const { Public, Tenant } =
  await import("./common/decorators/auth.decorators.js");
const { signAuthToken } = await import("./modules/auth/utils/jwt.js");

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

/** Legado mínimo: lê o corpo (como o `express.json` do `server.ts`) e tem uma rota. */
function fakeLegacy() {
  const legacy = express();
  legacy.use(express.json());
  legacy.get("/legacy-probe", (_req, res) => {
    res.json({ from: "legacy" });
  });
  legacy.post("/legacy-probe/echo", (req, res) => {
    res.json({ received: req.body });
  });
  return legacy;
}

describe("ponte Nest + Express legado", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(ProbeModule, fakeLegacy());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => app.getHttpServer();

  it("rota do legado é servida pelo legado", async () => {
    const res = await request(http()).get("/legacy-probe");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ from: "legacy" });
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

  it("o legado continua lendo o corpo das suas próprias rotas", async () => {
    const res = await request(http()).post("/legacy-probe/echo").send({ b: 2 });

    expect(res.body).toEqual({ received: { b: 2 } });
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
});
