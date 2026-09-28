import { pool } from "../config/db.js";
import { runMigrations } from "../config/migrate.js";
import { hashPassword } from "../modules/auth/password.js";
import { normalizeNeighborhood } from "../modules/store/neighborhood.js";

import type { PoolClient } from "pg";

/**
 * Seed de demonstração: um restaurante, um admin e a persona do atendente.
 * Re-executável: apaga só o próprio tenant (cascata) e recria.
 */

/** Senha do admin de demonstração. Sobrescrevível para não virar padrão. */
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "123456";

/**
 * `phone_number_id` do número de teste da Meta (painel do app → WhatsApp →
 * API Setup). Sem ele o tenant nasce só com o simulador.
 */
const SEED_PHONE_NUMBER_ID = process.env.SEED_WHATSAPP_PHONE_NUMBER_ID || null;

const DEMO = {
  slug: "pizzaria-demo",
  name: "Pizzaria Demo",
  adminEmail: "danilo@admin.com",
  bot: { name: "Nina", personality: "friendly", gender: "female" },
} as const;

async function seedStore(client: PoolClient, tenantId: number): Promise<void> {
  await client.query(
    `INSERT INTO store_settings (
        tenant_id, timezone, opening_hours, paused, min_order_cents,
        estimated_minutes, pickup_enabled, delivery_enabled, payment_methods,
        pix_key, owner_whatsapp
     ) VALUES ($1, $2, $3::jsonb, false, $4, $5, true, true, $6, $7, $8)`,
    [
      tenantId,
      "America/Sao_Paulo",
      JSON.stringify({
        mon: [["18:00", "23:30"]],
        tue: [["18:00", "23:30"]],
        wed: [["18:00", "23:30"]],
        thu: [["18:00", "23:30"]],
        fri: [["18:00", "23:30"]],
        sat: [["18:00", "00:00"]],
        sun: [["18:00", "00:00"]],
      }),
      2500,
      45,
      ["pix", "cash", "card_on_delivery"],
      "pagamentos@pizzariademo.com.br",
      "5511999999999",
    ],
  );

  const zones: Array<{ neighborhood: string; feeCents: number }> = [
    { neighborhood: "Centro", feeCents: 500 },
    { neighborhood: "Vila Mariana", feeCents: 700 },
    { neighborhood: "Pinheiros", feeCents: 800 },
    { neighborhood: "Moema", feeCents: 700 },
    { neighborhood: "Itaim Bibi", feeCents: 900 },
  ];
  for (const zone of zones) {
    await client.query(
      `INSERT INTO delivery_zones (tenant_id, neighborhood, neighborhood_key, fee_cents, active)
       VALUES ($1, $2, $3, $4, true)`,
      [tenantId, zone.neighborhood, normalizeNeighborhood(zone.neighborhood), zone.feeCents],
    );
  }
}

interface SeedOption {
  name: string;
  priceCents: number;
}

interface SeedOptionGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  pricingRule: "sum" | "max" | "average";
  options: SeedOption[];
}

interface SeedSize {
  name: string;
  priceCents: number;
}

interface SeedItem {
  name: string;
  description: string;
  priceCents: number | null;
  sizes?: SeedSize[];
  optionGroups?: SeedOptionGroup[];
}

const BORDA_GROUP: SeedOptionGroup = {
  name: "Borda",
  minSelect: 0,
  maxSelect: 1,
  pricingRule: "sum",
  options: [
    { name: "Sem borda", priceCents: 0 },
    { name: "Catupiry", priceCents: 800 },
    { name: "Cheddar", priceCents: 800 },
  ],
};

const ADICIONAIS_GROUP: SeedOptionGroup = {
  name: "Adicionais",
  minSelect: 0,
  maxSelect: 5,
  pricingRule: "sum",
  options: [
    { name: "Bacon", priceCents: 400 },
    { name: "Ovo", priceCents: 300 },
    { name: "Queijo extra", priceCents: 300 },
    { name: "Cebola caramelizada", priceCents: 300 },
  ],
};

const PIZZA_SIZES: SeedSize[] = [
  { name: "Média", priceCents: 4500 },
  { name: "Grande", priceCents: 5800 },
  { name: "Família", priceCents: 7200 },
];

const MENU: Array<{ category: string; items: SeedItem[] }> = [
  {
    category: "Pizzas",
    items: [
      {
        name: "Pizza Calabresa",
        description: "Molho de tomate, mussarela e calabresa fatiada.",
        priceCents: null,
        sizes: PIZZA_SIZES,
        optionGroups: [BORDA_GROUP],
      },
      {
        name: "Pizza Marguerita",
        description: "Molho de tomate, mussarela, manjericão fresco e tomate.",
        priceCents: null,
        sizes: PIZZA_SIZES,
        optionGroups: [BORDA_GROUP],
      },
      {
        name: "Pizza Frango com Catupiry",
        description: "Frango desfiado, catupiry e milho.",
        priceCents: null,
        sizes: PIZZA_SIZES,
        optionGroups: [BORDA_GROUP],
      },
      {
        name: "Pizza Quatro Queijos",
        description: "Mussarela, provolone, parmesão e gorgonzola.",
        priceCents: null,
        sizes: PIZZA_SIZES.map((s) => ({ ...s, priceCents: s.priceCents + 500 })),
        optionGroups: [BORDA_GROUP],
      },
      {
        name: "Pizza Meio a Meio",
        description: "Escolha dois sabores — o preço é a média dos dois.",
        priceCents: null,
        sizes: [
          { name: "Grande", priceCents: 5800 },
          { name: "Família", priceCents: 7200 },
        ],
        optionGroups: [
          {
            name: "Sabores",
            minSelect: 2,
            maxSelect: 2,
            pricingRule: "average",
            options: [
              { name: "Calabresa", priceCents: 0 },
              { name: "Marguerita", priceCents: 0 },
              { name: "Frango com Catupiry", priceCents: 0 },
              { name: "Quatro Queijos", priceCents: 500 },
            ],
          },
          BORDA_GROUP,
        ],
      },
    ],
  },
  {
    category: "Lanches",
    items: [
      {
        name: "X-Burger",
        description: "Pão, hambúrguer, queijo, alface e tomate.",
        priceCents: 1800,
        optionGroups: [ADICIONAIS_GROUP],
      },
      {
        name: "X-Salada",
        description: "Pão, hambúrguer, queijo, alface, tomate e maionese da casa.",
        priceCents: 2000,
        optionGroups: [ADICIONAIS_GROUP],
      },
      {
        name: "X-Tudo",
        description: "Pão, dois hambúrgueres, queijo, bacon, ovo, alface e tomate.",
        priceCents: 2500,
        optionGroups: [ADICIONAIS_GROUP],
      },
    ],
  },
  {
    category: "Bebidas",
    items: [
      { name: "Água Mineral", description: "500ml.", priceCents: 400 },
      { name: "Refrigerante Lata", description: "350ml.", priceCents: 600 },
      { name: "Refrigerante 2L", description: "Para dividir.", priceCents: 1200 },
      { name: "Suco Natural", description: "Polpa de fruta, 400ml.", priceCents: 900 },
    ],
  },
];

async function seedMenu(client: PoolClient, tenantId: number): Promise<void> {
  for (const [categoryIndex, category] of MENU.entries()) {
    const categoryResult = await client.query<{ id: number }>(
      `INSERT INTO menu_categories (tenant_id, name, position, active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [tenantId, category.category, categoryIndex],
    );
    const categoryId = categoryResult.rows[0]?.id;
    if (categoryId === undefined) throw new Error("categoria não criada");

    for (const [itemIndex, item] of category.items.entries()) {
      const itemResult = await client.query<{ id: number }>(
        `INSERT INTO menu_items
            (tenant_id, category_id, name, description, price_cents, available, active, position)
         VALUES ($1, $2, $3, $4, $5, true, true, $6)
         RETURNING id`,
        [tenantId, categoryId, item.name, item.description, item.priceCents, itemIndex],
      );
      const itemId = itemResult.rows[0]?.id;
      if (itemId === undefined) throw new Error("item não criado");

      for (const [sizeIndex, size] of (item.sizes ?? []).entries()) {
        await client.query(
          `INSERT INTO item_sizes (tenant_id, item_id, name, price_cents, position)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, itemId, size.name, size.priceCents, sizeIndex],
        );
      }

      for (const [groupIndex, group] of (item.optionGroups ?? []).entries()) {
        const groupResult = await client.query<{ id: number }>(
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
            groupIndex,
          ],
        );
        const groupId = groupResult.rows[0]?.id;
        if (groupId === undefined) throw new Error("grupo de opções não criado");

        for (const [optionIndex, option] of group.options.entries()) {
          await client.query(
            `INSERT INTO options (tenant_id, group_id, name, price_cents, available, position)
             VALUES ($1, $2, $3, $4, true, $5)`,
            [tenantId, groupId, option.name, option.priceCents, optionIndex],
          );
        }
      }
    }
  }
}

async function main(): Promise<void> {
  await runMigrations();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM tenants WHERE slug = $1`, [DEMO.slug]);

    const tenant = await client.query<{ id: number }>(
      `INSERT INTO tenants (slug, name, whatsapp_phone_number_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [DEMO.slug, DEMO.name, SEED_PHONE_NUMBER_ID],
    );
    const tenantId = tenant.rows[0]?.id;
    if (tenantId === undefined) throw new Error("tenant não criado");

    await client.query(
      `INSERT INTO bot_settings (tenant_id, name, personality, gender, languages)
       VALUES ($1, $2, $3, $4, ARRAY['pt-BR'])`,
      [tenantId, DEMO.bot.name, DEMO.bot.personality, DEMO.bot.gender],
    );

    // O hash nasce da MESMA `hashPassword` que o login confere. Um literal
    // bcrypt congelado se descolaria em silêncio se o custo mudasse.
    await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              tenant_id     = EXCLUDED.tenant_id,
              updated_at    = CURRENT_TIMESTAMP`,
      [tenantId, DEMO.adminEmail, await hashPassword(SEED_PASSWORD)],
    );

    await seedStore(client, tenantId);
    await seedMenu(client, tenantId);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log("Seed concluído.");
  console.log(`Login: ${DEMO.adminEmail} — senha: ${SEED_PASSWORD}`);
  console.log(
    SEED_PHONE_NUMBER_ID
      ? `WhatsApp ligado ao phone_number_id ${SEED_PHONE_NUMBER_ID}`
      : "WhatsApp não ligado (defina SEED_WHATSAPP_PHONE_NUMBER_ID). Use o simulador.",
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("Falha ao aplicar seed:", err);
    await pool.end();
    process.exit(1);
  });
