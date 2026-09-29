import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Body, Controller, Module, Post } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dir = await mkdtemp(join(tmpdir(), "produtos-"));
await writeFile(join(dir, "foto.png"), "PNGDATA");

vi.mock("./modules/menu/storage/imageStorage.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("./modules/menu/storage/imageStorage.js")
  >()),
  productImagesDir: () => dir,
}));

const { createApp } = await import("./bootstrap.js");
const { CommonModule } = await import("./common/common.module.js");
const { Public } = await import("./common/decorators/auth.decorators.js");
const { env } = await import("./config/env.js");

@Controller("probe")
class ProbeController {
  @Public()
  @Post("echo")
  echo(@Body() body: unknown) {
    return { received: body };
  }
}

@Module({ imports: [CommonModule], controllers: [ProbeController] })
class ProbeModule {}

describe("createApp (bootstrap)", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(ProbeModule);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => app.getHttpServer();

  it("serves product photos publicly under /produtos, without a token", async () => {
    const res = await request(http()).get("/produtos/foto.png");

    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe("PNGDATA");
  });

  it("answers 404 in the project's JSON for a photo that does not exist", async () => {
    const res = await request(http()).get("/produtos/nao-existe.png");

    expect(res.status).toBe(404);
  });

  it("CORS: reflects the configured origin and the preflight's requested headers", async () => {
    const res = await request(http())
      .options("/probe/echo")
      .set("Origin", env.corsOrigin as string)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(res.headers["access-control-allow-origin"]).toBe(env.corsOrigin);
    expect(res.headers["access-control-allow-headers"]).toMatch(
      /authorization/i,
    );
  });

  it("parses JSON bodies", async () => {
    const res = await request(http()).post("/probe/echo").send({ a: 1 });

    expect(res.body).toEqual({ received: { a: 1 } });
  });

  it("malformed JSON is a JSON 400, not a 500", async () => {
    const res = await request(http())
      .post("/probe/echo")
      .set("Content-Type", "application/json")
      .send("{oops");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: "error", code: "http_error" });
  });

  it("unknown route → 404 in the project's format", async () => {
    const res = await request(http()).get("/nao-existe");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("route_not_found");
  });
});
