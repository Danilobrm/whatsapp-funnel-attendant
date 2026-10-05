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

const service = {
  createZone: vi.fn(),
  getStoreSettings: vi.fn(),
  listZones: vi.fn(),
  removeZone: vi.fn(),
  updateStoreSettings: vi.fn(),
  updateZone: vi.fn(),
};
const geoService = {
  geocodeAddress: vi.fn(),
  getStoreGeo: vi.fn(),
  searchCities: vi.fn(),
  setStoreCity: vi.fn(),
};

const { StoreController } = await import("./store.controller.js");
const { StoreService } = await import("../services/store.service.js");
const { GeoService } = await import("../../geo/services/geo.service.js");
const { InvalidMenuError } = await import("../../errors/invalidMenu.error.js");
const { bearer, createControllerTestApp } =
  await import("../../../test/nestApp.js");
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const TENANT = asTenantId(1);

const fn = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;

describe("store controller", () => {
  let app: Awaited<ReturnType<typeof createControllerTestApp>>;

  beforeAll(async () => {
    app = await createControllerTestApp({
      controllers: [StoreController],
      providers: [
        { provide: StoreService, useValue: service },
        { provide: GeoService, useValue: geoService },
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
  const auth = () => bearer(9, 1);

  describe("GET/PUT /api/store", () => {
    it("GET devolve as configurações do tenant autenticado", async () => {
      const settings = { timezone: "America/Sao_Paulo" };
      fn(service.getStoreSettings).mockResolvedValue(settings);

      const res = await request(http())
        .get("/api/store")
        .set("Authorization", auth());

      expect(res.status).toBe(200);
      expect(service.getStoreSettings).toHaveBeenCalledWith(TENANT);
      expect(res.body).toEqual({ settings });
    });

    it("PUT encaminha o corpo ao serviço", async () => {
      const body = { timezone: "America/Sao_Paulo" };
      fn(service.updateStoreSettings).mockResolvedValue(body);

      const res = await request(http())
        .put("/api/store")
        .set("Authorization", auth())
        .send(body);

      expect(res.status).toBe(200);
      expect(service.updateStoreSettings).toHaveBeenCalledWith(TENANT, body);
    });

    it("exige token", async () => {
      const res = await request(http()).get("/api/store");

      expect(res.status).toBe(401);
      expect(service.getStoreSettings).not.toHaveBeenCalled();
    });

    it("falha inesperada vira 500 seguro", async () => {
      const logged = vi
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});
      fn(service.updateStoreSettings).mockRejectedValue(new Error("boom"));

      const res = await request(http())
        .put("/api/store")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.code).toBe("internal_error");
      logged.mockRestore();
    });
  });

  describe("zonas de entrega", () => {
    it("GET /zones lista as zonas do tenant", async () => {
      fn(service.listZones).mockResolvedValue([]);

      const res = await request(http())
        .get("/api/store/zones")
        .set("Authorization", auth());

      expect(service.listZones).toHaveBeenCalledWith(TENANT);
      expect(res.body).toEqual({ zones: [] });
    });

    it("POST /zones cria e devolve 201", async () => {
      const zone = {
        id: 1,
        neighborhood: "Centro",
        feeCents: 500,
        active: true,
      };
      fn(service.createZone).mockResolvedValue(zone);

      const res = await request(http())
        .post("/api/store/zones")
        .set("Authorization", auth())
        .send({ neighborhood: "Centro" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ zone });
      expect(service.createZone).toHaveBeenCalledWith(TENANT, {
        neighborhood: "Centro",
      });
    });

    it("PUT /zones/:id passa o id numérico da rota", async () => {
      fn(service.updateZone).mockResolvedValue({ id: 3 });

      const res = await request(http())
        .put("/api/store/zones/3")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(200);
      expect(service.updateZone).toHaveBeenCalledWith(TENANT, 3, {});
    });

    it("PUT /zones/:id com id não numérico vira 422 zone_not_found", async () => {
      const res = await request(http())
        .put("/api/store/zones/abc")
        .set("Authorization", auth())
        .send({});

      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: "zone_not_found", field: "id" });
      expect(service.updateZone).not.toHaveBeenCalled();
    });

    it("DELETE /zones/:id devolve 204 sem corpo", async () => {
      fn(service.removeZone).mockResolvedValue(undefined);

      const res = await request(http())
        .delete("/api/store/zones/3")
        .set("Authorization", auth());

      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect(service.removeZone).toHaveBeenCalledWith(TENANT, 3);
    });

    it("erro tipado do serviço sai como 422", async () => {
      fn(service.removeZone).mockRejectedValue(
        new InvalidMenuError("zone_not_found", "id"),
      );

      const res = await request(http())
        .delete("/api/store/zones/9")
        .set("Authorization", auth());

      expect(res.status).toBe(422);
      expect(res.body.code).toBe("zone_not_found");
    });
  });

  describe("cidade atendida (geo)", () => {
    it("GET /geo devolve o geo do tenant (null quando não escolheu cidade)", async () => {
      fn(geoService.getStoreGeo).mockResolvedValue(null);

      const res = await request(http())
        .get("/api/store/geo")
        .set("Authorization", auth());

      expect(geoService.getStoreGeo).toHaveBeenCalledWith(TENANT);
      expect(res.body).toEqual({ geo: null });
    });

    it("PUT /geo encaminha o corpo com o tenant autenticado", async () => {
      const geo = { cityOsmId: 334525, cityName: "Luziânia" };
      fn(geoService.setStoreCity).mockResolvedValue(geo);

      const res = await request(http())
        .put("/api/store/geo")
        .set("Authorization", auth())
        .send({ osmId: 334525 });

      expect(geoService.setStoreCity).toHaveBeenCalledWith(TENANT, {
        osmId: 334525,
      });
      expect(res.body).toEqual({ geo });
    });

    it("GET /geo/cities repassa ?q", async () => {
      fn(geoService.searchCities).mockResolvedValue([]);

      const res = await request(http())
        .get("/api/store/geo/cities?q=luzi")
        .set("Authorization", auth());

      expect(geoService.searchCities).toHaveBeenCalledWith("luzi");
      expect(res.body).toEqual({ cities: [] });
    });

    it("GET /geo/geocode repassa ?q e devolve results", async () => {
      const results = [{ lat: -16.25, lng: -47.95, label: "Rua 1" }];
      fn(geoService.geocodeAddress).mockResolvedValue(results);

      const res = await request(http())
        .get("/api/store/geo/geocode?q=Rua%201")
        .set("Authorization", auth());

      expect(geoService.geocodeAddress).toHaveBeenCalledWith("Rua 1");
      expect(res.body).toEqual({ results });
    });

    it("provedor geo fora do ar vira 502", async () => {
      const { GeoUnavailableError } =
        await import("../../geo/errors/geo.errors.js");
      fn(geoService.searchCities).mockRejectedValue(
        new GeoUnavailableError("http_504"),
      );

      const res = await request(http())
        .get("/api/store/geo/cities?q=x")
        .set("Authorization", auth());

      expect(res.status).toBe(502);
      expect(res.body.code).toBe("geo_unavailable");
    });
  });
});
