import { Module } from "@nestjs/common";

import { SimulatorController } from "./controllers/simulator.controller.js";

@Module({ controllers: [SimulatorController] })
export class SimulatorModule {}
