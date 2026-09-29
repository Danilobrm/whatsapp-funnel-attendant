import { Router } from "express";

import { getDashboardHandler } from "../controllers/dashboardController.js";

// Guardado no mount, em `server.ts`.
export const dashboardRoutes = Router();

dashboardRoutes.get("/", getDashboardHandler);
