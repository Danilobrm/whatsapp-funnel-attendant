import { Injectable } from "@nestjs/common";

import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import { MenuRepository } from "../repositories/menu.repository.js";
import { parseCategoryInput, parseItemInput } from "../utils/menu.parse.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Menu, MenuCategory, MenuItem } from "../types/menu.types.js";

// ---------------------------------------------------------------------------
// Cache do cardápio publicado — lido a cada mensagem do agente (fase 2),
// invalidado em toda escrita do painel. Mesmo padrão de `SettingsService`.
// ---------------------------------------------------------------------------
const MENU_CACHE_TTL_MS = 15_000;

interface MenuCacheEntry {
  value: Menu;
  expiresAt: number;
}

@Injectable()
export class MenuService {
  private readonly publishedCache = new Map<TenantId, MenuCacheEntry>();

  constructor(private readonly menus: MenuRepository) {}

  invalidateMenuCache(tenantId?: TenantId): void {
    if (tenantId === undefined) {
      this.publishedCache.clear();
    } else {
      this.publishedCache.delete(tenantId);
    }
  }

  /** Cardápio ativo, pronto para o agente ler (fase 2). */
  async getPublishedMenu(tenantId: TenantId): Promise<Menu> {
    const now = Date.now();
    const hit = this.publishedCache.get(tenantId);
    if (hit !== undefined && hit.expiresAt > now) return hit.value;
    if (hit !== undefined) this.publishedCache.delete(tenantId);

    const value = await this.menus.getActiveMenu(tenantId);
    this.publishedCache.set(tenantId, {
      value,
      expiresAt: now + MENU_CACHE_TTL_MS,
    });
    return value;
  }

  /** Painel: tudo, ativo ou não — a edição precisa enxergar itens pausados/removidos. */
  getFullMenu(tenantId: TenantId): Promise<Menu> {
    return this.menus.getFullMenu(tenantId);
  }

  listCategories(tenantId: TenantId): Promise<MenuCategory[]> {
    return this.menus.listCategories(tenantId);
  }

  async createCategory(
    tenantId: TenantId,
    input: unknown,
  ): Promise<MenuCategory> {
    const category = await this.menus.createCategory(
      tenantId,
      parseCategoryInput(input),
    );
    this.invalidateMenuCache(tenantId);
    return category;
  }

  async updateCategory(
    tenantId: TenantId,
    id: number,
    input: unknown,
  ): Promise<MenuCategory> {
    const category = await this.menus.updateCategory(
      tenantId,
      id,
      parseCategoryInput(input),
    );
    if (!category) throw new InvalidMenuError("category_not_found", "id");
    this.invalidateMenuCache(tenantId);
    return category;
  }

  async deleteCategory(tenantId: TenantId, id: number): Promise<void> {
    const deleted = await this.menus.deleteCategory(tenantId, id);
    if (!deleted) throw new InvalidMenuError("category_not_found", "id");
    this.invalidateMenuCache(tenantId);
  }

  async reorderCategories(
    tenantId: TenantId,
    orderedIds: number[],
  ): Promise<void> {
    await this.menus.reorderCategories(tenantId, orderedIds);
    this.invalidateMenuCache(tenantId);
  }

  async createItem(tenantId: TenantId, input: unknown): Promise<MenuItem> {
    const item = await this.menus.createItem(tenantId, parseItemInput(input));
    this.invalidateMenuCache(tenantId);
    return item;
  }

  async updateItem(
    tenantId: TenantId,
    id: number,
    input: unknown,
  ): Promise<MenuItem> {
    const item = await this.menus.updateItem(
      tenantId,
      id,
      parseItemInput(input),
    );
    if (!item) throw new InvalidMenuError("item_not_found", "id");
    this.invalidateMenuCache(tenantId);
    return item;
  }

  async deleteItem(tenantId: TenantId, id: number): Promise<void> {
    const deleted = await this.menus.deleteItem(tenantId, id);
    if (!deleted) throw new InvalidMenuError("item_not_found", "id");
    this.invalidateMenuCache(tenantId);
  }

  async setItemAvailability(
    tenantId: TenantId,
    id: number,
    available: boolean,
  ): Promise<void> {
    const updated = await this.menus.updateItemAvailability(
      tenantId,
      id,
      available,
    );
    if (!updated) throw new InvalidMenuError("item_not_found", "id");
    this.invalidateMenuCache(tenantId);
  }

  async reorderItems(tenantId: TenantId, orderedIds: number[]): Promise<void> {
    await this.menus.reorderItems(tenantId, orderedIds);
    this.invalidateMenuCache(tenantId);
  }
}
