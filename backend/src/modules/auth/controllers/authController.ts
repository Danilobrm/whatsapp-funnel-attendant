import { currentUser, login } from "../services/auth.service.js";
import { authOf } from "../../../api/utils/authContext.js";
import { asyncHandler } from "../../../api/utils/asyncHandler.js";

export const postLogin = asyncHandler(async (req, res) => {
  const result = await login(req.body);
  res.json(result);
});

/**
 * Revalida a sessão guardada no localStorage. Sem este endpoint, um token
 * expirado manteria o SPA renderizando `/admin` até a primeira chamada de API
 * falhar — o usuário veria a casca do painel e um erro genérico depois.
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = await currentUser(authOf(req).userId);
  res.json({ user });
});
