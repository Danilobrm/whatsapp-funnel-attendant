import { Router } from "express";

import { health } from "../controllers/healthController.js";

/** Público: é o healthcheck do compose, que não tem token para apresentar. */
export const healthRoutes = Router();

healthRoutes.get("/", health);
