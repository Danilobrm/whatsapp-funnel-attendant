import { Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const google = { reverseGeocodeGoogle: vi.fn() };
const service = { getStoreSettings: vi.fn(), updateStoreSettings: vi.fn() };
const { StoreLocationService } = await import("./store.location.js");
const location = new StoreLocationService(service as never, google as never);
const setStoreLocation = location.setStoreLocation.bind(location);
const { asTenantId } = await import("../../tenants/types/tenant.types.js");

const TENANT = asTenantId(4);
const CURRENT = {
  restaurantName: "Pizzaria",
  address: "Antigo",
  latitude: 1,
  longitude: 2,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(service.getStoreSettings).mockResolvedValue(CURRENT as never);
});

describe("setStoreLocation", () => {
  it("saves the point and the address text that Google returned", async () => {
    vi.mocked(google.reverseGeocodeGoogle).mockResolvedValue({
      lat: -16.25,
      lng: -47.95,
      label: "Rua 1, Luziânia - GO",
    });

    await expect(setStoreLocation(TENANT, -16.25, -47.95)).resolves.toEqual({
      address: "Rua 1, Luziânia - GO",
    });
    expect(service.updateStoreSettings).toHaveBeenCalledWith(TENANT, {
      ...CURRENT,
      latitude: -16.25,
      longitude: -47.95,
      address: "Rua 1, Luziânia - GO",
    });
  });

  it("clears the old address when Google finds none or fails, but keeps the point", async () => {
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    for (const setup of [
      () => vi.mocked(google.reverseGeocodeGoogle).mockResolvedValue(null),
      () =>
        vi
          .mocked(google.reverseGeocodeGoogle)
          .mockRejectedValue(new Error("x")),
    ]) {
      vi.mocked(service.updateStoreSettings).mockClear();
      setup();
      await expect(setStoreLocation(TENANT, 5, 6)).resolves.toEqual({
        address: null,
      });
      expect(service.updateStoreSettings).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ latitude: 5, longitude: 6, address: null }),
      );
    }
  });

  it("truncates the address to the 300 chars the settings accept", async () => {
    vi.mocked(google.reverseGeocodeGoogle).mockResolvedValue({
      lat: 0,
      lng: 0,
      label: "x".repeat(400),
    });
    const { address } = await setStoreLocation(TENANT, 0, 0);
    expect(address).toHaveLength(300);
  });
});
