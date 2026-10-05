import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const report = vi.fn();

const { HealthController } = await import("./health.controller.js");
const { HealthService } = await import("../services/health.service.js");
const { createControllerTestApp } = await import("../../../test/nestApp.js");

describe("GET /health", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: { getHealthReport: report } },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it("is public and answers 200 with the report when healthy", async () => {
    const body = {
      status: "ok",
      database: "connected",
      message: "ok",
      checkedAt: "t",
    };
    report.mockResolvedValue(body as never);

    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(body);
  });

  it("answers 500 with the report when the database is unreachable", async () => {
    const body = {
      status: "error",
      database: "unreachable",
      message: "x",
      checkedAt: "t",
    };
    report.mockResolvedValue(body as never);

    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(500);
    expect(res.body).toEqual(body);
  });
});
