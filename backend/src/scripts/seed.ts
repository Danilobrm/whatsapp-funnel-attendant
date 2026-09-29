import { pool } from "../config/db.js";
import { runMigrations } from "../config/migrate.js";
import { hashPassword } from "../modules/auth/utils/password.js";
import { normalizeNeighborhood } from "../modules/store/utils/neighborhood.js";

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
      [
        tenantId,
        zone.neighborhood,
        normalizeNeighborhood(zone.neighborhood),
        zone.feeCents,
      ],
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
        sizes: PIZZA_SIZES.map((s) => ({
          ...s,
          priceCents: s.priceCents + 500,
        })),
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
        description:
          "Pão, hambúrguer, queijo, alface, tomate e maionese da casa.",
        priceCents: 2000,
        optionGroups: [ADICIONAIS_GROUP],
      },
      {
        name: "X-Tudo",
        description:
          "Pão, dois hambúrgueres, queijo, bacon, ovo, alface e tomate.",
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
      {
        name: "Refrigerante 2L",
        description: "Para dividir.",
        priceCents: 1200,
      },
      {
        name: "Suco Natural",
        description: "Polpa de fruta, 400ml.",
        priceCents: 900,
      },
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
        [
          tenantId,
          categoryId,
          item.name,
          item.description,
          item.priceCents,
          itemIndex,
        ],
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
        if (groupId === undefined)
          throw new Error("grupo de opções não criado");

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

interface SeedOrderLine {
  name: string;
  sizeName?: string;
  unitPriceCents: number;
  quantity: number;
  options?: Array<{ group: string; name: string; priceCents: number }>;
  notes?: string;
}

interface SeedOrder {
  minutesAgo: number;
  status:
    | "pending"
    | "accepted"
    | "out_for_delivery"
    | "ready_for_pickup"
    | "completed"
    | "rejected";
  customerName: string;
  customerPhone: string;
  neighborhood: string | null;
  feeCents: number;
  paymentMethod: "pix" | "cash" | "card_on_delivery";
  changeForCents?: number;
  rejectReason?: string;
  notes?: string;
  lines: SeedOrderLine[];
}

/**
 * Pedidos de hoje em todos os estados, para o quadro do balcão ter o que
 * mostrar logo após o seed. Um `pending` antigo (7 min) aparece em vermelho.
 * Snapshot de nomes/preços do cardápio acima.
 */
const SEED_ORDERS: SeedOrder[] = [
  {
    minutesAgo: 7,
    status: "pending",
    customerName: "Ana Souza",
    customerPhone: "5511990000001",
    neighborhood: "Centro",
    feeCents: 500,
    paymentMethod: "cash",
    changeForCents: 10000,
    lines: [
      {
        name: "Pizza Calabresa",
        sizeName: "Grande",
        unitPriceCents: 6600,
        quantity: 1,
        options: [{ group: "Borda", name: "Catupiry", priceCents: 800 }],
      },
      { name: "Refrigerante 2L", unitPriceCents: 1200, quantity: 1 },
    ],
  },
  {
    minutesAgo: 1,
    status: "pending",
    customerName: "Bruno Lima",
    customerPhone: "5511990000002",
    neighborhood: null,
    feeCents: 0,
    paymentMethod: "pix",
    lines: [
      {
        name: "X-Tudo",
        unitPriceCents: 2500,
        quantity: 2,
        notes: "Sem cebola",
      },
    ],
  },
  {
    minutesAgo: 18,
    status: "accepted",
    customerName: "Carla Mendes",
    customerPhone: "5511990000003",
    neighborhood: "Pinheiros",
    feeCents: 800,
    paymentMethod: "card_on_delivery",
    lines: [
      {
        name: "Pizza Quatro Queijos",
        sizeName: "Família",
        unitPriceCents: 7200,
        quantity: 1,
      },
      { name: "Suco Natural", unitPriceCents: 900, quantity: 2 },
    ],
  },
  {
    minutesAgo: 35,
    status: "out_for_delivery",
    customerName: "Diego Rocha",
    customerPhone: "5511990000004",
    neighborhood: "Moema",
    feeCents: 700,
    paymentMethod: "pix",
    lines: [
      {
        name: "Pizza Marguerita",
        sizeName: "Média",
        unitPriceCents: 4500,
        quantity: 1,
      },
    ],
  },
  {
    minutesAgo: 25,
    status: "ready_for_pickup",
    customerName: "Elisa Martins",
    customerPhone: "5511990000005",
    neighborhood: null,
    feeCents: 0,
    paymentMethod: "cash",
    lines: [{ name: "X-Salada", unitPriceCents: 2000, quantity: 1 }],
  },
  {
    minutesAgo: 90,
    status: "completed",
    customerName: "Fábio Nunes",
    customerPhone: "5511990000006",
    neighborhood: "Vila Mariana",
    feeCents: 700,
    paymentMethod: "pix",
    lines: [{ name: "X-Burger", unitPriceCents: 1800, quantity: 3 }],
  },
  {
    minutesAgo: 60,
    status: "rejected",
    customerName: "Gabi Torres",
    customerPhone: "5511990000007",
    neighborhood: null,
    feeCents: 0,
    paymentMethod: "pix",
    rejectReason: "sold_out",
    lines: [{ name: "Suco Natural", unitPriceCents: 900, quantity: 1 }],
  },
];

async function seedOrders(client: PoolClient, tenantId: number): Promise<void> {
  for (const [index, order] of SEED_ORDERS.entries()) {
    const subtotal = order.lines.reduce(
      (sum, l) => sum + l.unitPriceCents * l.quantity,
      0,
    );
    const createdAt = new Date(
      Date.now() - order.minutesAgo * 60_000,
    ).toISOString();
    const reached = (s: SeedOrder["status"][]) =>
      s.includes(order.status) ? createdAt : null;
    const result = await client.query<{ id: number }>(
      `INSERT INTO orders (
         tenant_id, number, customer_name, customer_phone, status, fulfillment,
         address, neighborhood, payment_method, change_for_cents, subtotal_cents,
         fee_cents, total_cents, notes, reject_reason, created_at, accepted_at,
         ready_at, completed_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $16)
       RETURNING id`,
      [
        tenantId,
        index + 1,
        order.customerName,
        order.customerPhone,
        order.status,
        order.neighborhood ? "delivery" : "pickup",
        order.neighborhood
          ? JSON.stringify({
              street: "Rua das Flores",
              number: String(100 + index),
              complement: null,
              reference: null,
            })
          : null,
        order.neighborhood,
        order.paymentMethod,
        order.changeForCents ?? null,
        subtotal,
        order.feeCents,
        subtotal + order.feeCents,
        order.notes ?? null,
        order.rejectReason ?? null,
        createdAt,
        reached([
          "accepted",
          "out_for_delivery",
          "ready_for_pickup",
          "completed",
        ]),
        reached(["out_for_delivery", "ready_for_pickup", "completed"]),
        reached(["completed"]),
      ],
    );
    const orderId = result.rows[0]?.id;
    for (const [position, line] of order.lines.entries()) {
      await client.query(
        `INSERT INTO order_items (tenant_id, order_id, name, size_name, unit_price_cents, quantity, options, notes, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          orderId,
          line.name,
          line.sizeName ?? null,
          line.unitPriceCents,
          line.quantity,
          JSON.stringify(line.options ?? []),
          line.notes ?? null,
          position,
        ],
      );
    }
  }
  await client.query(
    `INSERT INTO order_counters (tenant_id, last_number) VALUES ($1, $2)`,
    [tenantId, SEED_ORDERS.length],
  );
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
    await seedOrders(client, tenantId);

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
