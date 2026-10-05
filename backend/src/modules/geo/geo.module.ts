import { Module } from "@nestjs/common";

import { GoogleGeocodingClient } from "./clients/google.client.js";
import { OsmClient } from "./clients/osm.client.js";
import { GeoRepository } from "./repositories/geo.repository.js";
import { GeoService } from "./services/geo.service.js";

@Module({
  providers: [GeoRepository, GeoService, OsmClient, GoogleGeocodingClient],
  exports: [GeoService, GoogleGeocodingClient],
})
export class GeoModule {}
