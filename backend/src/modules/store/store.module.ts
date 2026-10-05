import { Module } from "@nestjs/common";

import { GeoModule } from "../geo/geo.module.js";
import { StoreController } from "./controllers/store.controller.js";
import { StoreRepository } from "./repositories/store.repository.js";
import { StoreLocationService } from "./services/store.location.js";
import { StoreService } from "./services/store.service.js";

@Module({
  imports: [GeoModule],
  controllers: [StoreController],
  providers: [StoreRepository, StoreService, StoreLocationService],
  exports: [StoreService, StoreLocationService],
})
export class StoreModule {}
