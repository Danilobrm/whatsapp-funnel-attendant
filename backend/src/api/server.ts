import cors from "cors";
import express, { type Express, type Request } from "express";

import { env } from "../config/env.js";
import { productImagesDir } from "../modules/menu/storage/imageStorage.js";
import { menuRoutes } from "../modules/menu/routes/menuRoutes.js";
import { createPublicRoutes } from "../modules/menulink/routes/publicRoutes.js";
import { createOrderRoutes } from "../modules/order/routes/orderRoutes.js";
import { simulatorRoutes } from "../modules/simulator/routes/simulatorRoutes.js";
import { storeRoutes } from "../modules/store/routes/storeRoutes.js";
import { whatsappRoutes } from "../modules/whatsapp/routes/whatsappRoutes.js";
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
  app.use("/webhooks/whatsapp", whatsappRoutes); // autenticado por assinatura HMAC
  // Cardápio em link: autenticado pelo TOKEN da URL (não há login do cliente),
  // com rate limit por IP.
  app.use("/api/public", createPublicRoutes());
  // Fotos de produto: público (o painel usa a URL direto em <img>), como
  // seria um bucket S3 público. Só o UPLOAD (`POST /api/menu/images`) exige
  // login — servir o arquivo depois de gravado não precisa.
  app.use("/produtos", express.static(productImagesDir()));

  // ---- Superfície autenticada ----
  // O guard fica no MOUNT, não rota a rota: esquecer é impossível, porque não
  // existe lugar onde omitir.
  app.use("/api/simulator", requireAuth, simulatorRoutes);
  app.use("/api/menu", requireAuth, menuRoutes);
  app.use("/api/store", requireAuth, storeRoutes);
  app.use("/api/orders", requireAuth, createOrderRoutes());

  app.use(errorHandler);

  return app;
}
