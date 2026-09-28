import { Router } from "express";

import {
  deleteZone,
  getStore,
  getZones,
  postZone,
  putStore,
  putZone,
} from "../controllers/storeController.js";

// Guardado no mount, em `server.ts`.
export const storeRoutes = Router();

storeRoutes.get("/", getStore);
storeRoutes.put("/", putStore);

storeRoutes.get("/zones", getZones);
storeRoutes.post("/zones", postZone);
storeRoutes.put("/zones/:id", putZone);
storeRoutes.delete("/zones/:id", deleteZone);
