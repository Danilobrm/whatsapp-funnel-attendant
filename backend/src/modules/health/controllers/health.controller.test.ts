import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../services/health.service.js", () => ({
  getHealthReport: vi.fn(),
}));

const { getHealthReport } = await import("../services/health.service.js");
const { HealthModule } = await import("../health.module.js");
const { createTestApp } = await import("../../../test/nestApp.js");

const report = vi.mocked(getHealthReport);

describe("GET /health", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    app = await createTestApp(HealthModule);
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
