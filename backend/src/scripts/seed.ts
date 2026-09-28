import { pool } from "../config/db.js";
import { runMigrations } from "../config/migrate.js";
import { hashPassword } from "../modules/auth/password.js";

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
