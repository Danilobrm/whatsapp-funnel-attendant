import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseInterceptors,
} from "@nestjs/common";

import { Tenant } from "../../../common/decorators/auth.decorators.js";
import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { ProductImageUploadInterceptor } from "../interceptors/productImageUpload.interceptor.js";
import { MenuService } from "../services/menu.service.js";
import { ProductImageStorage } from "../storage/imageStorage.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Request } from "express";

/** Rotas com `:id` numérico — um id não numérico é sempre "não encontrado". */
function idParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    throw new InvalidMenuError("item_not_found", "id");
  }
  return id;
}

function orderedIds(body: unknown): number[] {
  const raw = (body as { orderedIds?: unknown } | null)?.orderedIds;
  if (!Array.isArray(raw) || !raw.every((v) => typeof v === "number")) {
    throw new InvalidMenuError("item_not_found", "orderedIds");
  }
  return raw;
}

@Controller("api/menu")
export class MenuController {
  constructor(
    private readonly menu: MenuService,
    private readonly images: ProductImageStorage,
  ) {}

  @Get()
  async getMenu(@Tenant() tenantId: TenantId) {
    const menu = await this.menu.getFullMenu(tenantId);
    return { menu };
  }

  @Post("categories")
  async postCategory(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const category = await this.menu.createCategory(tenantId, body);
    return { category };
  }

  // `reorder` antes de qualquer rota com `:id`, senão seria lido como id.
  @HttpCode(204)
  @Post("categories/reorder")
  async postCategoriesReorder(
    @Tenant() tenantId: TenantId,
    @Body() body: unknown,
  ): Promise<void> {
    await this.menu.reorderCategories(tenantId, orderedIds(body));
  }

  @Put("categories/:id")
  async putCategory(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const category = await this.menu.updateCategory(
      tenantId,
      idParam(id),
      body,
    );
    return { category };
  }

  @HttpCode(204)
  @Delete("categories/:id")
  async deleteCategory(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
  ): Promise<void> {
    await this.menu.deleteCategory(tenantId, idParam(id));
  }

  @Post("items")
  async postItem(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const item = await this.menu.createItem(tenantId, body);
    return { item };
  }

  @HttpCode(204)
  @Post("items/reorder")
  async postItemsReorder(
    @Tenant() tenantId: TenantId,
    @Body() body: unknown,
  ): Promise<void> {
    await this.menu.reorderItems(tenantId, orderedIds(body));
  }

  @Put("items/:id")
  async putItem(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const item = await this.menu.updateItem(tenantId, idParam(id), body);
    return { item };
  }

  @HttpCode(204)
  @Delete("items/:id")
  async deleteItem(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
  ): Promise<void> {
    await this.menu.deleteItem(tenantId, idParam(id));
  }

  @HttpCode(204)
  @Patch("items/:id/availability")
  async patchItemAvailability(
    @Tenant() tenantId: TenantId,
    @Param("id") id: string,
    @Body() body: { available?: unknown } | null,
  ): Promise<void> {
    await this.menu.setItemAvailability(
      tenantId,
      idParam(id),
      body?.available === true,
    );
  }

  /**
   * O interceptor (multer) roda ANTES desta e já valida tipo (fileFilter) e
   * tamanho (limits) — aqui só falta checar que veio arquivo. O upload não é
   * tenant-scoped (o arquivo não carrega tenant_id), mas exige o mesmo login
   * que o resto de `/api/menu` (guard global).
   */
  @UseInterceptors(ProductImageUploadInterceptor)
  @Post("images")
  async postItemImage(@Req() req: Request) {
    if (!req.file) {
      throw new InvalidMenuError("image_required", "image");
    }

    return this.images.saveProductImage(req.file.buffer, req.file.mimetype);
  }
}
