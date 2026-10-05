import { Injectable } from "@nestjs/common";

import { TenantDb } from "../../../common/database/tenantDb.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  AreaGeometry,
  Neighborhood,
  StoreGeo,
} from "../types/geo.types.js";

interface StoreGeoRow {
  city_osm_id: string | number;
  city_name: string;
  state: string | null;
  city_geometry: AreaGeometry;
  neighborhoods: Neighborhood[];
  fetched_at: Date | string;
}

const COLUMNS =
  "city_osm_id, city_name, state, city_geometry, neighborhoods, fetched_at";

function toStoreGeo(row: StoreGeoRow): StoreGeo {
  return {
    // BIGINT chega como string do `pg`; ids de relation cabem em Number.
    cityOsmId: Number(row.city_osm_id),
    cityName: row.city_name,
    state: row.state,
    cityGeometry: row.city_geometry,
    neighborhoods: row.neighborhoods,
    fetchedAt:
      row.fetched_at instanceof Date
        ? row.fetched_at.toISOString()
        : row.fetched_at,
  };
}

@Injectable()
export class GeoRepository {
  constructor(private readonly db: TenantDb) {}

  async findStoreGeo(tenantId: TenantId): Promise<StoreGeo | null> {
    const result = await this.db.query<StoreGeoRow>(
      tenantId,
      `SELECT ${COLUMNS} FROM store_geo WHERE tenant_id = $1`,
      [tenantId],
    );
    const row = result.rows[0];
    return row ? toStoreGeo(row) : null;
  }

  async saveStoreGeo(
    tenantId: TenantId,
    geo: Omit<StoreGeo, "fetchedAt">,
  ): Promise<StoreGeo> {
    const result = await this.db.query<StoreGeoRow>(
      tenantId,
      `INSERT INTO store_geo (tenant_id, city_osm_id, city_name, state, city_geometry, neighborhoods, fetched_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (tenant_id) DO UPDATE
          SET city_osm_id = EXCLUDED.city_osm_id,
              city_name = EXCLUDED.city_name,
              state = EXCLUDED.state,
              city_geometry = EXCLUDED.city_geometry,
              neighborhoods = EXCLUDED.neighborhoods,
              fetched_at = CURRENT_TIMESTAMP
       RETURNING ${COLUMNS}`,
      [
        tenantId,
        geo.cityOsmId,
        geo.cityName,
        geo.state,
        JSON.stringify(geo.cityGeometry),
        JSON.stringify(geo.neighborhoods),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Falha ao salvar a cidade da loja");
    return toStoreGeo(row);
  }
}
