import { tenantQuery } from "../../config/tenantQuery.js";

import type { TenantId } from "../tenants/tenant.types.js";
import type { BotSettings } from "./settings.types.js";

interface BotSettingsRow {
  name: string;
  personality: string;
  gender: string;
  languages: string[] | null;
  updated_at: Date | string | null;
}

function toBotSettings(row: BotSettingsRow): BotSettings {
  return {
    name: row.name,
    personality: row.personality as BotSettings["personality"],
    gender: row.gender as BotSettings["gender"],
    languages: row.languages ?? [],
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : (row.updated_at ?? null),
  };
}

/**
 * Configuração do bot do tenant. `null` quando ele ainda não personalizou nada
 * — o serviço cai nos defaults, não é erro.
 */
export async function findBotSettings(
  tenantId: TenantId,
): Promise<BotSettings | null> {
  const result = await tenantQuery<BotSettingsRow>(
    tenantId,
    `SELECT name, personality, gender, languages, updated_at
       FROM bot_settings
      WHERE tenant_id = $1`,
    [tenantId],
  );

  const row = result.rows[0];
  return row ? toBotSettings(row) : null;
}

/** Upsert por tenant — devolve o estado persistido, não o de entrada. */
export async function saveBotSettings(
  tenantId: TenantId,
  settings: Omit<BotSettings, "updatedAt">,
): Promise<BotSettings> {
  const result = await tenantQuery<BotSettingsRow>(
    tenantId,
    `INSERT INTO bot_settings (tenant_id, name, personality, gender, languages, updated_at)
     VALUES ($1, $2, $3, $4, $5::text[], CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id) DO UPDATE
        SET name = EXCLUDED.name,
            personality = EXCLUDED.personality,
            gender = EXCLUDED.gender,
            languages = EXCLUDED.languages,
            updated_at = CURRENT_TIMESTAMP
     RETURNING name, personality, gender, languages, updated_at`,
    [
      tenantId,
      settings.name,
      settings.personality,
      settings.gender,
      settings.languages,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Falha ao salvar a configuração do chatbot");
  return toBotSettings(row);
}
