import cors from "cors";
import express, { type Express, type Request } from "express";

import { env } from "../config/env.js";
import { authRoutes } from "./routes/authRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { settingsRoutes } from "./routes/settingsRoutes.js";
import { simulatorRoutes } from "./routes/simulatorRoutes.js";
import { whatsappRoutes } from "./routes/whatsappRoutes.js";
import { requireAuth } from "./middlewares/auth/requireAuth.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const WEBHOOK_PREFIX = "/webhooks/";

export function createServer(): Express {
  const app = express();

  // CORS não precisa de ajuste para o Bearer: com apenas `origin` definido, o
  // pacote `cors` reflete o `Access-Control-Request-Headers` do preflight.
  app.use(cors({ origin: env.corsOrigin }));
  app.use(
    express.json({
      // A assinatura do webhook da Meta é sobre os BYTES originais do corpo;
      // o JSON parseado não os reproduz. Guarda o buffer só nessas rotas.
      verify: (req, _res, buf) => {
        if (req.url?.startsWith(WEBHOOK_PREFIX)) {
          (req as Request).rawBody = buf;
        }
      },
    }),
  );

  // ---- Superfície pública ----
  app.use("/health", healthRoutes);
  app.use("/api/auth", authRoutes); // POST /login aberto; GET /me guarda no router
  app.use("/webhooks/whatsapp", whatsappRoutes); // autenticado por assinatura HMAC

  // ---- Superfície autenticada ----
  // O guard fica no MOUNT, não rota a rota: esquecer é impossível, porque não
  // existe lugar onde omitir.
  app.use("/api/settings", requireAuth, settingsRoutes);
  app.use("/api/simulator", requireAuth, simulatorRoutes);

  app.use(errorHandler);

  return app;
}
