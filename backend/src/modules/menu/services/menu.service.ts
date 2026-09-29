import { InvalidMenuError } from "../../errors/invalidMenu.error.js";
import {
  createCategory as repoCreateCategory,
  createItem as repoCreateItem,
  deleteCategory as repoDeleteCategory,
  deleteItem as repoDeleteItem,
  getActiveMenu,
  getFullMenu as repoGetFullMenu,
  listCategories as repoListCategories,
  reorderCategories as repoReorderCategories,
  reorderItems as repoReorderItems,
  updateCategory as repoUpdateCategory,
  updateItem as repoUpdateItem,
  updateItemAvailability,
} from "../repositories/menu.repository.js";
import { PRICING_RULES } from "../types/menu.types.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type {
  Menu,
  MenuCategory,
  MenuCategoryInput,
  MenuItem,
  MenuItemInput,
  OptionGroupInput,
  PricingRule,
} from "../types/menu.types.js";

const MAX_NAME_CHARS = 160;

function requiredString(
  raw: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value =
    typeof raw[field] === "string" ? (raw[field] as string).trim() : "";
  if (value.length === 0) {
    throw new InvalidMenuError("name_required", field);
  }
  if (value.length > maxLength) {
    throw new InvalidMenuError("name_too_long", field);
  }
  return value;
}

function nonNegativeInt(
  value: unknown,
  code: InvalidMenuErrorCode,
  field: string,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new InvalidMenuError(code, field);
  }
  return value;
}

type InvalidMenuErrorCode = ConstructorParameters<typeof InvalidMenuError>[0];

export function parseCategoryInput(input: unknown): MenuCategoryInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const name = requiredString(raw, "name", MAX_NAME_CHARS);
  const position =
    typeof raw.position === "number" && Number.isInteger(raw.position)
      ? raw.position
      : 0;
  const active = raw.active !== false;
  return { name, position, active };
}

function parseOptionGroup(raw: unknown, index: number): OptionGroupInput {
  const group = (raw ?? {}) as Record<string, unknown>;
  const name = requiredString(group, "name", MAX_NAME_CHARS);

  const minSelect = nonNegativeInt(
    group.minSelect,
    "min_select_invalid",
    "minSelect",
  );
  if (
    typeof group.maxSelect !== "number" ||
    !Number.isInteger(group.maxSelect) ||
    group.maxSelect < 1
  ) {
    throw new InvalidMenuError("max_select_invalid", "maxSelect");
  }
  const maxSelect = group.maxSelect;
  if (minSelect > maxSelect) {
    throw new InvalidMenuError("min_greater_than_max", "maxSelect");
  }

  if (!PRICING_RULES.includes(group.pricingRule as PricingRule)) {
    throw new InvalidMenuError("unknown_pricing_rule", "pricingRule");
  }
  const pricingRule = group.pricingRule as PricingRule;

  const position =
    typeof group.position === "number" && Number.isInteger(group.position)
      ? group.position
      : index;

  const rawOptions = Array.isArray(group.options) ? group.options : [];
  const options = rawOptions.map((rawOption, index) => {
    const option = (rawOption ?? {}) as Record<string, unknown>;
    const optionName = requiredString(option, "name", MAX_NAME_CHARS);
    const priceCents = nonNegativeInt(
      option.priceCents,
      "price_invalid",
      "priceCents",
    );
    const available = option.available !== false;
    const optionPosition =
      typeof option.position === "number" && Number.isInteger(option.position)
        ? option.position
        : index;
    return {
      name: optionName,
      priceCents,
      available,
      position: optionPosition,
    };
  });

  return { name, minSelect, maxSelect, pricingRule, position, options };
}

export function parseItemInput(input: unknown): MenuItemInput {
  const raw = (input ?? {}) as Record<string, unknown>;

  const categoryId = raw.categoryId;
  if (
    typeof categoryId !== "number" ||
    !Number.isInteger(categoryId) ||
    categoryId <= 0
  ) {
    throw new InvalidMenuError("category_required", "categoryId");
  }

  const name = requiredString(raw, "name", MAX_NAME_CHARS);
  const description =
    typeof raw.description === "string" && raw.description.trim().length > 0
      ? raw.description.trim()
      : null;
  const imageUrl =
    typeof raw.imageUrl === "string" && raw.imageUrl.trim().length > 0
      ? raw.imageUrl.trim()
      : null;

  const priceCents =
    raw.priceCents === null || raw.priceCents === undefined
      ? null
      : nonNegativeInt(raw.priceCents, "price_invalid", "priceCents");

  const available = raw.available !== false;
  const active = raw.active !== false;
  const position =
    typeof raw.position === "number" && Number.isInteger(raw.position)
      ? raw.position
      : 0;

  const rawSizes = Array.isArray(raw.sizes) ? raw.sizes : [];
  const sizes = rawSizes.map((rawSize, index) => {
    const size = (rawSize ?? {}) as Record<string, unknown>;
    const sizeName = requiredString(size, "name", 60);
    const sizePrice = nonNegativeInt(
      size.priceCents,
      "size_price_invalid",
      "priceCents",
    );
    const sizePosition =
      typeof size.position === "number" && Number.isInteger(size.position)
        ? size.position
        : index;
    return { name: sizeName, priceCents: sizePrice, position: sizePosition };
  });

  if (priceCents === null && sizes.length === 0) {
    throw new InvalidMenuError("price_or_sizes_required", "priceCents");
  }

  const rawGroups = Array.isArray(raw.optionGroups) ? raw.optionGroups : [];
  const optionGroups = rawGroups.map((rawGroup, index) =>
    parseOptionGroup(rawGroup, index),
  );

  return {
    categoryId,
    name,
    description,
    priceCents,
    imageUrl,
    available,
    active,
    position,
    sizes,
    optionGroups,
  };
}

// ---------------------------------------------------------------------------
// Cache do cardápio publicado — lido a cada mensagem do agente (fase 2),
// invalidado em toda escrita do painel. Mesmo padrão de `settings.service.ts`.
// ---------------------------------------------------------------------------
const MENU_CACHE_TTL_MS = 15_000;

interface MenuCacheEntry {
  value: Menu;
  expiresAt: number;
}

const publishedCache = new Map<TenantId, MenuCacheEntry>();

export function invalidateMenuCache(tenantId?: TenantId): void {
  if (tenantId === undefined) {
    publishedCache.clear();
  } else {
    publishedCache.delete(tenantId);
  }
}

/** Cardápio ativo, pronto para o agente ler (fase 2). */
export async function getPublishedMenu(tenantId: TenantId): Promise<Menu> {
  const now = Date.now();
  const hit = publishedCache.get(tenantId);
  if (hit !== undefined && hit.expiresAt > now) return hit.value;
  if (hit !== undefined) publishedCache.delete(tenantId);

  const value = await getActiveMenu(tenantId);
  publishedCache.set(tenantId, { value, expiresAt: now + MENU_CACHE_TTL_MS });
  return value;
}

/** Painel: tudo, ativo ou não — a edição precisa enxergar itens pausados/removidos. */
export function getFullMenu(tenantId: TenantId): Promise<Menu> {
  return repoGetFullMenu(tenantId);
}

export function listCategories(tenantId: TenantId): Promise<MenuCategory[]> {
  return repoListCategories(tenantId);
}

export async function createCategory(
  tenantId: TenantId,
  input: unknown,
): Promise<MenuCategory> {
  const category = await repoCreateCategory(
    tenantId,
    parseCategoryInput(input),
  );
  invalidateMenuCache(tenantId);
  return category;
}

export async function updateCategory(
  tenantId: TenantId,
  id: number,
  input: unknown,
): Promise<MenuCategory> {
  const category = await repoUpdateCategory(
    tenantId,
    id,
    parseCategoryInput(input),
  );
  if (!category) throw new InvalidMenuError("category_not_found", "id");
  invalidateMenuCache(tenantId);
  return category;
}

export async function deleteCategory(
  tenantId: TenantId,
  id: number,
): Promise<void> {
  const deleted = await repoDeleteCategory(tenantId, id);
  if (!deleted) throw new InvalidMenuError("category_not_found", "id");
  invalidateMenuCache(tenantId);
}

export async function reorderCategories(
  tenantId: TenantId,
  orderedIds: number[],
): Promise<void> {
  await repoReorderCategories(tenantId, orderedIds);
  invalidateMenuCache(tenantId);
}

export async function createItem(
  tenantId: TenantId,
  input: unknown,
): Promise<MenuItem> {
  const item = await repoCreateItem(tenantId, parseItemInput(input));
  invalidateMenuCache(tenantId);
  return item;
}

export async function updateItem(
  tenantId: TenantId,
  id: number,
  input: unknown,
): Promise<MenuItem> {
  const item = await repoUpdateItem(tenantId, id, parseItemInput(input));
  if (!item) throw new InvalidMenuError("item_not_found", "id");
  invalidateMenuCache(tenantId);
  return item;
}

export async function deleteItem(
  tenantId: TenantId,
  id: number,
): Promise<void> {
  const deleted = await repoDeleteItem(tenantId, id);
  if (!deleted) throw new InvalidMenuError("item_not_found", "id");
  invalidateMenuCache(tenantId);
}

export async function setItemAvailability(
  tenantId: TenantId,
  id: number,
  available: boolean,
): Promise<void> {
  const updated = await updateItemAvailability(tenantId, id, available);
  if (!updated) throw new InvalidMenuError("item_not_found", "id");
  invalidateMenuCache(tenantId);
}

export async function reorderItems(
  tenantId: TenantId,
  orderedIds: number[],
): Promise<void> {
  await repoReorderItems(tenantId, orderedIds);
  invalidateMenuCache(tenantId);
}
