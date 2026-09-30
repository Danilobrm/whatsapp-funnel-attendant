import { Injectable, Logger } from "@nestjs/common";

import { SettingsRepository } from "../repositories/settings.repository.js";
import {
  DEFAULT_BOT_SETTINGS,
  buildPersonaTexts,
  parseBotSettings,
  type PersonaTexts,
} from "../utils/persona.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { BotSettings } from "../types/settings.types.js";

/**
 * Cache da configuração, uma entrada POR TENANT. A persona é lida em toda
 * saudação, identidade e fallback, e é o que o agente usa para o tom. A linha muda por ação humana em `/admin/settings`, então um TTL curto +
 * invalidação na escrita mantém a leitura barata sem servir persona velha por
 * mais que alguns segundos.
 *
 * Sem varredura periódica: a expiração é preguiçosa, na leitura. Um
 * `setInterval` manteria o event loop vivo e travaria o teardown do vitest. O
 * Map é limitado pelo número de tenants, e a chave só existe depois de uma
 * consulta bem-sucedida — não é controlada por quem chama.
 */
const SETTINGS_CACHE_TTL_MS = 30_000;

interface SettingsCacheEntry {
  value: BotSettings;
  expiresAt: number;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<TenantId, SettingsCacheEntry>();

  constructor(private readonly settings: SettingsRepository) {}

  /**
   * Descarta o cache. Sem argumento limpa tudo; com tenant, só aquele.
   */
  invalidateBotSettingsCache(tenantId?: TenantId): void {
    if (tenantId === undefined) {
      this.cache.clear();
    } else {
      this.cache.delete(tenantId);
    }
  }

  /** Configuração persistida, com defaults quando a linha ainda não existe. */
  async getBotSettings(tenantId: TenantId): Promise<BotSettings> {
    const now = Date.now();
    const hit = this.cache.get(tenantId);
    if (hit !== undefined && hit.expiresAt > now) {
      return hit.value;
    }
    if (hit !== undefined) {
      this.cache.delete(tenantId);
    }

    const stored = await this.settings.findBotSettings(tenantId);
    const value = stored ?? { ...DEFAULT_BOT_SETTINGS };
    this.cache.set(tenantId, { value, expiresAt: now + SETTINGS_CACHE_TTL_MS });
    return value;
  }

  async updateBotSettings(
    tenantId: TenantId,
    input: unknown,
  ): Promise<BotSettings> {
    const saved = await this.settings.saveBotSettings(
      tenantId,
      parseBotSettings(input),
    );
    this.cache.set(tenantId, {
      value: saved,
      expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    });
    return saved;
  }

  /**
   * Textos da persona para o chat. Uma falha de leitura da configuração não
   * pode derrubar a conversa — cai no default e segue, porque a resposta ao
   * usuário não depende da persona estar disponível.
   */
  async resolvePersonaTexts(tenantId: TenantId): Promise<PersonaTexts> {
    try {
      return buildPersonaTexts(await this.getBotSettings(tenantId));
    } catch (err) {
      this.logger.error(
        `Falha ao carregar a persona do chatbot: ${err instanceof Error ? err.message : String(err)}`,
      );
      return buildPersonaTexts(DEFAULT_BOT_SETTINGS);
    }
  }
}
