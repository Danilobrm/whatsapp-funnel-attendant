import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import {
  Public,
  RateLimit,
} from "../../../common/decorators/auth.decorators.js";
import { RateLimitGuard } from "../../../common/guards/rateLimit.guard.js";
import { MenuLinkService } from "../services/menuLink.service.js";

/**
 * Rotas PÚBLICAS do cardápio em link. Não há `req.auth`: a credencial é o
 * código da URL, que o serviço resolve no banco (a linha carrega o tenant).
 * O limite por IP existe porque aqui qualquer um na internet pode bater; o
 * guard roda antes do handler, então antes de qualquer consulta ao banco.
 */
@Public()
@UseGuards(RateLimitGuard)
@Controller("api/public")
export class PublicMenuController {
  constructor(private readonly menuLinks: MenuLinkService) {}

  @RateLimit({ windowMs: 60_000, max: 60 })
  @Get("menu/:code")
  getMenu(@Param("code") code: string) {
    return this.menuLinks.getPublicMenuView(code);
  }

  // 200, não o 201 padrão do Nest: confirmar o carrinho não cria recurso da API.
  @RateLimit({ windowMs: 60_000, max: 20 })
  @HttpCode(200)
  @Post("cart/:code")
  async postCart(@Param("code") code: string, @Body() body: unknown) {
    const cart = await this.menuLinks.confirmPublicCart(code, body);
    return { cart };
  }
}
