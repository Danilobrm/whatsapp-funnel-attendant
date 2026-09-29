import { Router } from "express";

import { getSettings, putSettings } from "../controllers/settingsController.js";

// Guardado no mount, em `server.ts`.
export const settingsRoutes = Router();

settingsRoutes.get("/", getSettings);
settingsRoutes.put("/", putSettings);
