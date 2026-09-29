import { Router } from "express";

import {
  deleteSimulatorConversation,
  getSimulatorCartHandler,
  getSimulatorConversation,
  getSimulatorCustomers,
  postSimulatorCustomer,
  postSimulatorMessage,
} from "../controllers/simulatorController.js";

// Guardado no mount, em `server.ts`.
export const simulatorRoutes = Router();

simulatorRoutes.get("/conversation", getSimulatorConversation);
simulatorRoutes.delete("/conversation", deleteSimulatorConversation);
simulatorRoutes.get("/cart", getSimulatorCartHandler);
simulatorRoutes.post("/messages", postSimulatorMessage);
simulatorRoutes.get("/customers", getSimulatorCustomers);
simulatorRoutes.post("/customers", postSimulatorCustomer);
