import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/db.js", () => ({
  query: vi.fn(),
}));

const db = await import("../../config/db.js");
const { getHealthReport } = await import("./health.service.js");

const query = db.query as unknown as ReturnType<typeof vi.fn>;

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
    vi.spyOn(console, "error").mockImplementation(() => {});

    const report = await getHealthReport();

    expect(report.status).toBe("error");
    expect(JSON.stringify(report)).not.toContain("10.0.0.5");
  });
});
