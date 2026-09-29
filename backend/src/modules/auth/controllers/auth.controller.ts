import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";

import { Auth, Public } from "../../../common/decorators/auth.decorators.js";
import { currentUser, login } from "../services/auth.service.js";

import type { RequestAuth } from "../types/auth.types.js";

@Controller("api/auth")
export class AuthController {
  // 200, não o 201 padrão do Nest para POST: login não cria recurso.
  @Public()
  @HttpCode(200)
  @Post("login")
  login(@Body() body: unknown) {
    return login(body);
  }

  /**
   * Revalida a sessão guardada no localStorage. Sem este endpoint, um token
   * expirado manteria o SPA renderizando `/admin` até a primeira chamada de API
   * falhar — o usuário veria a casca do painel e um erro genérico depois.
   */
  @Get("me")
  async me(@Auth() auth: RequestAuth) {
    const user = await currentUser(auth.userId);
    return { user };
  }
}
