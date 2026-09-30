import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const { HealthService } = await import("./health.service.js");
const health = new HealthService({ query } as never);
const getHealthReport = health.getHealthReport.bind(health);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getHealthReport", () => {
  it("reports ok when the database answers", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(getHealthReport()).resolves.toMatchObject({
      status: "ok",
      database: "connected",
    });
  });

  it("never leaks the driver message in the public body", async () => {
    query.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});

    const report = await getHealthReport();

    expect(report.status).toBe("error");
    expect(JSON.stringify(report)).not.toContain("10.0.0.5");
  });
});
