import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { Tenant } from "../../../common/decorators/auth.decorators.js";
import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import {
  geocodeAddress,
  getStoreGeo,
  searchCities,
  setStoreCity,
} from "../../geo/services/geo.service.js";
import {
  createZone,
  getStoreSettings,
  listZones,
  removeZone,
  updateStoreSettings,
  updateZone,
} from "../services/store.service.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";

function zoneId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    throw new InvalidMenuError("zone_not_found", "id");
  }
  return id;
}

@Controller("api/store")
export class StoreController {
  @Get()
  async getStore(@Tenant() tenantId: TenantId) {
    const settings = await getStoreSettings(tenantId);
    return { settings };
  }

  @Put()
  async putStore(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const settings = await updateStoreSettings(tenantId, body);
    return { settings };
  }

  @Get("zones")
  async getZones(@Tenant() tenantId: TenantId) {
    const zones = await listZones(tenantId);
    return { zones };
  }

  @Post("zones")
  async postZone(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const zone = await createZone(tenantId, body);
    return { zone };
  }

  @Put("zones/:id")
  async putZone(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const zone = await updateZone(tenantId, zoneId(id), body);
    return { zone };
  }

  @HttpCode(204)
  @Delete("zones/:id")
  async deleteZone(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
  ): Promise<void> {
    await removeZone(tenantId, zoneId(id));
  }

  @Get("geo")
  async getGeo(@Tenant() tenantId: TenantId) {
    const geo = await getStoreGeo(tenantId);
    return { geo };
  }

  @Put("geo")
  async putGeo(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const geo = await setStoreCity(tenantId, body);
    return { geo };
  }

  @Get("geo/cities")
  async getCities(@Query("q") q: unknown) {
    const cities = await searchCities(q);
    return { cities };
  }

  @Get("geo/geocode")
  async getGeocode(@Query("q") q: unknown) {
    const results = await geocodeAddress(q);
    return { results };
  }
}
