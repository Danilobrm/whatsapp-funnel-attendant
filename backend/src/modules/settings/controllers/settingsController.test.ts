import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../services/settings.service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../services/settings.service.js")
      >();
    return {
      ...actual,
      getBotSettings: vi.fn(),
      updateBotSettings: vi.fn(),
    };
  },
);

const service = await import("../services/settings.service.js");
const { getSettings, putSettings } = await import("./settingsController.js");

import { asTenantId } from "../../tenants/types/tenant.types.js";

const TENANT = asTenantId(1);
/** Requisição já autenticada — é o que `requireAuth` entrega ao controller. */
const AUTH_REQ = { auth: { userId: 9, tenantId: TENANT } };

const getMock = service.getBotSettings as ReturnType<typeof vi.fn>;
const updateMock = service.updateBotSettings as ReturnType<typeof vi.fn>;

const settings = {
  name: "Nina",
  personality: "friendly" as const,
  gender: "female" as const,
  languages: ["pt-BR"],
};

function makeRes() {
  const res: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  } = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSettings", () => {
  it("returns settings, options and the persona preview", async () => {
    getMock.mockResolvedValue(settings);
    const res = makeRes();

    await getSettings({ ...AUTH_REQ } as never, res as never, vi.fn());

    const payload = res.json.mock.calls[0]?.[0];
    expect(payload.settings).toEqual(settings);
    expect(payload.options.languages).toEqual(["pt-BR"]);
    expect(payload.preview.greeting).toContain("Nina");
  });
});

describe("putSettings", () => {
  it("saves the body and returns the refreshed preview", async () => {
    updateMock.mockResolvedValue({ ...settings, personality: "objective" });
    const res = makeRes();

    await putSettings(
      { ...AUTH_REQ, body: settings } as never,
      res as never,
      vi.fn(),
    );

    expect(updateMock).toHaveBeenCalledWith(TENANT, settings);
    expect(res.json.mock.calls[0]?.[0].preview.greeting).toContain("Nina");
  });

  it("forwards rejections to next (asyncHandler wiring)", async () => {
    const err = new Error("boom");
    updateMock.mockRejectedValue(err);
    const next = vi.fn();

    putSettings({ ...AUTH_REQ, body: {} } as never, makeRes() as never, next);

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(err));
  });
});
