import { Router } from "express";

import {
  deleteSimulatorConversation,
  getSimulatorConversation,
  postSimulatorMessage,
} from "../controllers/simulatorController.js";

// Guardado no mount, em `server.ts`.
export const simulatorRoutes = Router();

simulatorRoutes.get("/conversation", getSimulatorConversation);
simulatorRoutes.delete("/conversation", deleteSimulatorConversation);
simulatorRoutes.post("/messages", postSimulatorMessage);
