import { Logger } from "@nestjs/common";
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

const getMock = vi.fn();
const updateMock = vi.fn();

const { SettingsController } = await import("./settings.controller.js");
const { SettingsService } = await import("../services/settings.service.js");
const { InvalidSettingsError } = await import("../errors/settings.errors.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const TENANT = asTenantId(4);

const settings = {
  name: "Nina",
  personality: "friendly" as const,
  gender: "female" as const,
  languages: ["pt-BR"],
};

describe("settings controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [SettingsController],
      providers: [
        {
          provide: SettingsService,
          useValue: { getBotSettings: getMock, updateBotSettings: updateMock },
        },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const http = () => app.getHttpServer();
  const auth = () => bearer(9, 4);

  describe("GET /api/settings", () => {
    it("returns settings, options and the persona preview for the token's tenant", async () => {
      getMock.mockResolvedValue(settings as never);

      const res = await request(http())
        .get("/api/settings")
        .set("Authorization", auth());

      expect(res.status).toBe(200);
      expect(res.body.settings).toEqual(settings);
      expect(res.body.options.languages).toEqual(["pt-BR"]);
      expect(res.body.preview.greeting).toContain("Nina");
      expect(getMock).toHaveBeenCalledWith(TENANT);
    });

    it("requires a token", async () => {
      const res = await request(http()).get("/api/settings");

      expect(res.status).toBe(401);
      expect(getMock).not.toHaveBeenCalled();
    });
  });

  describe("PUT /api/settings", () => {
    it("saves the body and returns the refreshed preview", async () => {
      updateMock.mockResolvedValue({
        ...settings,
        personality: "objective",
      } as never);

      const res = await request(http())
        .put("/api/settings")
        .set("Authorization", auth())
        .send(settings);

      expect(res.status).toBe(200);
      expect(updateMock).toHaveBeenCalledWith(TENANT, settings);
      expect(res.body.preview.greeting).toContain("Nina");
    });

    it("maps a typed rejection to 422 (code + field)", async () => {
      updateMock.mockRejectedValue(
        new InvalidSettingsError("unsupported_language", "languages"),
      );

      const res = await request(http())
        .put("/api/settings")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({
        status: "invalid",
        code: "unsupported_language",
        field: "languages",
      });
    });

    it("maps an unexpected failure to a safe 500", async () => {
      const logged = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      updateMock.mockRejectedValue(new Error("boom"));

      const res = await request(http())
        .put("/api/settings")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.code).toBe("internal_error");
      logged.mockRestore();
    });
  });
});
