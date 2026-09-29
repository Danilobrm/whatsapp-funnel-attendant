import {
  confirmPublicCart,
  getPublicMenuView,
} from "../services/menuLink.service.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

/**
 * Rotas PÚBLICAS do cardápio em link. Não há `req.auth`: a credencial é o
 * código da URL, que o serviço resolve no banco (a linha carrega o tenant).
 */
export const getPublicMenu = asyncHandler(async (req, res) => {
  const view = await getPublicMenuView(String(req.params.code));
  res.json(view);
});

export const postPublicCart = asyncHandler(async (req, res) => {
  const cart = await confirmPublicCart(String(req.params.code), req.body);
  res.json({ cart });
});
