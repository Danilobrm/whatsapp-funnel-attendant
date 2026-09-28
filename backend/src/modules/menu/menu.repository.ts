import { pool, query } from "../../config/db.js";

import type { PoolClient } from "pg";
import type { TenantId } from "../tenants/tenant.types.js";
import type {
  ItemSize,
  Menu,
  MenuCategory,
  MenuCategoryInput,
  MenuItem,
  MenuItemInput,
  MenuOption,
  OptionGroup,
  PricingRule,
} from "./menu.types.js";

async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

interface CategoryRow {
  id: number;
  name: string;
  position: number;
  active: boolean;
}

function toCategory(row: CategoryRow): MenuCategory {
  return { id: row.id, name: row.name, position: row.position, active: row.active };
}

export async function listCategories(tenantId: TenantId): Promise<MenuCategory[]> {
  const result = await query<CategoryRow>(
    `SELECT id, name, position, active
       FROM menu_categories
      WHERE tenant_id = $1
      ORDER BY position ASC, id ASC`,
    [tenantId],
  );
  return result.rows.map(toCategory);
}

export async function createCategory(
  tenantId: TenantId,
  input: MenuCategoryInput,
): Promise<MenuCategory> {
  const result = await query<CategoryRow>(
    `INSERT INTO menu_categories (tenant_id, name, position, active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, position, active`,
    [tenantId, input.name, input.position, input.active],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Falha ao criar a categoria");
  return toCategory(row);
}

export async function updateCategory(
  tenantId: TenantId,
  id: number,
  input: MenuCategoryInput,
): Promise<MenuCategory | null> {
  const result = await query<CategoryRow>(
    `UPDATE menu_categories
        SET name = $3, position = $4, active = $5
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, name, position, active`,
    [tenantId, id, input.name, input.position, input.active],
  );
  const row = result.rows[0];
  return row ? toCategory(row) : null;
}

export async function deleteCategory(
  tenantId: TenantId,
  id: number,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM menu_categories WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function reorderCategories(
  tenantId: TenantId,
  orderedIds: number[],
): Promise<void> {
  await withTransaction(async (client) => {
    for (const [index, id] of orderedIds.entries()) {
      await client.query(
        `UPDATE menu_categories SET position = $3 WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, index],
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Itens (com tamanhos e grupos de opções aninhados)
// ---------------------------------------------------------------------------

interface ItemRow {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price_cents: number | null;
  image_url: string | null;
  available: boolean;
  active: boolean;
  position: number;
}

interface SizeRow {
  id: number;
  item_id: number;
  name: string;
  price_cents: number;
  position: number;
}

interface GroupRow {
  id: number;
  item_id: number;
  name: string;
  min_select: number;
  max_select: number;
  pricing_rule: PricingRule;
  position: number;
}

interface OptionRow {
  id: number;
  group_id: number;
  name: string;
  price_cents: number;
  available: boolean;
  position: number;
}

function toSize(row: SizeRow): ItemSize {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    position: row.position,
  };
}

function toOption(row: OptionRow): MenuOption {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    available: row.available,
    position: row.position,
  };
}

async function insertSizes(
  client: PoolClient,
  tenantId: TenantId,
  itemId: number,
  sizes: MenuItemInput["sizes"],
): Promise<void> {
  for (const [index, size] of sizes.entries()) {
    await client.query(
      `INSERT INTO item_sizes (tenant_id, item_id, name, price_cents, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, itemId, size.name, size.priceCents, size.position ?? index],
    );
  }
}

async function insertOptionGroups(
  client: PoolClient,
  tenantId: TenantId,
  itemId: number,
  groups: MenuItemInput["optionGroups"],
): Promise<void> {
  for (const [index, group] of groups.entries()) {
    const result = await client.query<{ id: number }>(
      `INSERT INTO option_groups
          (tenant_id, item_id, name, min_select, max_select, pricing_rule, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        tenantId,
        itemId,
        group.name,
        group.minSelect,
        group.maxSelect,
        group.pricingRule,
        group.position ?? index,
      ],
    );
    const groupId = result.rows[0]?.id;
    if (groupId === undefined) throw new Error("Falha ao criar grupo de opções");

    for (const [optIndex, option] of group.options.entries()) {
      await client.query(
        `INSERT INTO options (tenant_id, group_id, name, price_cents, available, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tenantId,
          groupId,
          option.name,
          option.priceCents,
          option.available,
          option.position ?? optIndex,
        ],
      );
    }
  }
}

async function loadItemChildren(
  tenantId: TenantId,
  itemIds: number[],
): Promise<{
  sizesByItem: Map<number, ItemSize[]>;
  groupsByItem: Map<number, OptionGroup[]>;
}> {
  const sizesByItem = new Map<number, ItemSize[]>();
  const groupsByItem = new Map<number, OptionGroup[]>();
  if (itemIds.length === 0) return { sizesByItem, groupsByItem };

  const sizesResult = await query<SizeRow>(
    `SELECT id, item_id, name, price_cents, position
       FROM item_sizes
      WHERE tenant_id = $1 AND item_id = ANY($2::int[])
      ORDER BY item_id, position, id`,
    [tenantId, itemIds],
  );
  for (const row of sizesResult.rows) {
    const list = sizesByItem.get(row.item_id) ?? [];
    list.push(toSize(row));
    sizesByItem.set(row.item_id, list);
  }

  const groupsResult = await query<GroupRow>(
    `SELECT id, item_id, name, min_select, max_select, pricing_rule, position
       FROM option_groups
      WHERE tenant_id = $1 AND item_id = ANY($2::int[])
      ORDER BY item_id, position, id`,
    [tenantId, itemIds],
  );
  const groupIds = groupsResult.rows.map((r) => r.id);

  const optionsByGroup = new Map<number, MenuOption[]>();
  if (groupIds.length > 0) {
    const optionsResult = await query<OptionRow>(
      `SELECT id, group_id, name, price_cents, available, position
         FROM options
        WHERE tenant_id = $1 AND group_id = ANY($2::int[])
        ORDER BY group_id, position, id`,
      [tenantId, groupIds],
    );
    for (const row of optionsResult.rows) {
      const list = optionsByGroup.get(row.group_id) ?? [];
      list.push(toOption(row));
      optionsByGroup.set(row.group_id, list);
    }
  }

  for (const row of groupsResult.rows) {
    const list = groupsByItem.get(row.item_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      minSelect: row.min_select,
      maxSelect: row.max_select,
      pricingRule: row.pricing_rule,
      position: row.position,
      options: optionsByGroup.get(row.id) ?? [],
    });
    groupsByItem.set(row.item_id, list);
  }

  return { sizesByItem, groupsByItem };
}

function toItem(
  row: ItemRow,
  sizes: ItemSize[],
  optionGroups: OptionGroup[],
): MenuItem {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    imageUrl: row.image_url,
    available: row.available,
    active: row.active,
    position: row.position,
    sizes,
    optionGroups,
  };
}

export async function createItem(
  tenantId: TenantId,
  input: MenuItemInput,
): Promise<MenuItem> {
  return withTransaction(async (client) => {
    const result = await client.query<ItemRow>(
      `INSERT INTO menu_items
          (tenant_id, category_id, name, description, price_cents, image_url,
           available, active, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, category_id, name, description, price_cents, image_url,
                 available, active, position`,
      [
        tenantId,
        input.categoryId,
        input.name,
        input.description,
        input.priceCents,
        input.imageUrl,
        input.available,
        input.active,
        input.position,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Falha ao criar o item");

    await insertSizes(client, tenantId, row.id, input.sizes);
    await insertOptionGroups(client, tenantId, row.id, input.optionGroups);

    const { sizesByItem, groupsByItem } = await loadItemChildrenInClient(
      client,
      tenantId,
      row.id,
    );

    return toItem(row, sizesByItem, groupsByItem);
  });
}

/** Mesma leitura de `loadItemChildren`, mas dentro da MESMA transação/conexão. */
async function loadItemChildrenInClient(
  client: PoolClient,
  tenantId: TenantId,
  itemId: number,
): Promise<{ sizesByItem: ItemSize[]; groupsByItem: OptionGroup[] }> {
  const sizesResult = await client.query<SizeRow>(
    `SELECT id, item_id, name, price_cents, position
       FROM item_sizes
      WHERE tenant_id = $1 AND item_id = $2
      ORDER BY position, id`,
    [tenantId, itemId],
  );

  const groupsResult = await client.query<GroupRow>(
    `SELECT id, item_id, name, min_select, max_select, pricing_rule, position
       FROM option_groups
      WHERE tenant_id = $1 AND item_id = $2
      ORDER BY position, id`,
    [tenantId, itemId],
  );

  const groups: OptionGroup[] = [];
  for (const g of groupsResult.rows) {
    const optionsResult = await client.query<OptionRow>(
      `SELECT id, group_id, name, price_cents, available, position
         FROM options
        WHERE tenant_id = $1 AND group_id = $2
        ORDER BY position, id`,
      [tenantId, g.id],
    );
    groups.push({
      id: g.id,
      name: g.name,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      pricingRule: g.pricing_rule,
      position: g.position,
      options: optionsResult.rows.map(toOption),
    });
  }

  return { sizesByItem: sizesResult.rows.map(toSize), groupsByItem: groups };
}

export async function updateItem(
  tenantId: TenantId,
  id: number,
  input: MenuItemInput,
): Promise<MenuItem | null> {
  return withTransaction(async (client) => {
    const result = await client.query<ItemRow>(
      `UPDATE menu_items
          SET category_id = $3, name = $4, description = $5, price_cents = $6,
              image_url = $7, available = $8, active = $9, position = $10
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, category_id, name, description, price_cents, image_url,
                  available, active, position`,
      [
        tenantId,
        id,
        input.categoryId,
        input.name,
        input.description,
        input.priceCents,
        input.imageUrl,
        input.available,
        input.active,
        input.position,
      ],
    );
    const row = result.rows[0];
    if (!row) return null;

    // Substitui tamanhos e grupos de opções por inteiro: mais simples e
    // confiável do que diff granular, e o drawer sempre envia a lista completa.
    await client.query(
      `DELETE FROM item_sizes WHERE tenant_id = $1 AND item_id = $2`,
      [tenantId, id],
    );
    await client.query(
      `DELETE FROM option_groups WHERE tenant_id = $1 AND item_id = $2`,
      [tenantId, id],
    );

    await insertSizes(client, tenantId, id, input.sizes);
    await insertOptionGroups(client, tenantId, id, input.optionGroups);

    const { sizesByItem, groupsByItem } = await loadItemChildrenInClient(
      client,
      tenantId,
      id,
    );

    return toItem(row, sizesByItem, groupsByItem);
  });
}

export async function deleteItem(tenantId: TenantId, id: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM menu_items WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateItemAvailability(
  tenantId: TenantId,
  id: number,
  available: boolean,
): Promise<boolean> {
  const result = await query(
    `UPDATE menu_items SET available = $3 WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id, available],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function reorderItems(
  tenantId: TenantId,
  orderedIds: number[],
): Promise<void> {
  await withTransaction(async (client) => {
    for (const [index, id] of orderedIds.entries()) {
      await client.query(
        `UPDATE menu_items SET position = $3 WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id, index],
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Cardápio completo — painel (tudo) e agente (só ativo)
// ---------------------------------------------------------------------------

async function loadMenu(tenantId: TenantId, onlyActive: boolean): Promise<Menu> {
  const categoriesResult = await query<CategoryRow>(
    `SELECT id, name, position, active
       FROM menu_categories
      WHERE tenant_id = $1 ${onlyActive ? "AND active = true" : ""}
      ORDER BY position, id`,
    [tenantId],
  );

  const itemsResult = await query<ItemRow>(
    `SELECT id, category_id, name, description, price_cents, image_url,
            available, active, position
       FROM menu_items
      WHERE tenant_id = $1 ${onlyActive ? "AND active = true" : ""}
      ORDER BY category_id, position, id`,
    [tenantId],
  );

  const { sizesByItem, groupsByItem } = await loadItemChildren(
    tenantId,
    itemsResult.rows.map((r) => r.id),
  );

  const itemsByCategory = new Map<number, MenuItem[]>();
  for (const row of itemsResult.rows) {
    const list = itemsByCategory.get(row.category_id) ?? [];
    list.push(
      toItem(row, sizesByItem.get(row.id) ?? [], groupsByItem.get(row.id) ?? []),
    );
    itemsByCategory.set(row.category_id, list);
  }

  return categoriesResult.rows.map((row) => ({
    ...toCategory(row),
    items: itemsByCategory.get(row.id) ?? [],
  }));
}

/** Painel: todas as categorias e itens, ativos ou não (edição precisa enxergar tudo). */
export function getFullMenu(tenantId: TenantId): Promise<Menu> {
  return loadMenu(tenantId, false);
}

/** Agente (fase 2): só categorias e itens ativos. */
export function getActiveMenu(tenantId: TenantId): Promise<Menu> {
  return loadMenu(tenantId, true);
}
