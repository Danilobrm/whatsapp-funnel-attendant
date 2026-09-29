import { Router } from "express";

import { getMe, postLogin } from "../controllers/authController.js";
import { requireAuth } from "../../../api/middlewares/auth/requireAuth.js";

export const authRoutes = Router();

authRoutes.post("/login", postLogin);
authRoutes.get("/me", requireAuth, getMe);
