import { request } from '../client';

export type BotPersonality = 'friendly' | 'formal' | 'objective' | 'technical';
export type BotGender = 'neutral' | 'female' | 'male';

export interface BotSettings {
  name: string;
  personality: BotPersonality;
  gender: BotGender;
  languages: string[];
  updatedAt?: string | null;
}

export interface BotSettingsOptions {
  personalities: BotPersonality[];
  genders: BotGender[];
  /** Idiomas suportados pelo backend. Hoje só `pt-BR`. */
  languages: string[];
}

/**
 * Textos fixos que o bot escreve sem IA (saudação, identidade, fallback,
 * "não entendi"). As respostas da IA seguem o tom, mas não passam por aqui.
 */
export interface PersonaPreview {
  greeting: string;
  identity: string;
  fallback: string;
  junk: string;
}

export interface BotSettingsResponse {
  settings: BotSettings;
  options: BotSettingsOptions;
  preview: PersonaPreview;
}

export interface SavedBotSettings {
  settings: BotSettings;
  preview: PersonaPreview;
}

/** 422 do backend — `code` decide a mensagem, nunca o `message` cru. */
export class SettingsRejectedError extends Error {
  readonly code: string;
  readonly field: string;

  constructor(code: string, field: string) {
    super(code);
    this.name = 'SettingsRejectedError';
    this.code = code;
    this.field = field;
  }
}

export function fetchBotSettings(): Promise<BotSettingsResponse> {
  return request<BotSettingsResponse>('/api/settings');
}

export function saveBotSettings(
  settings: Omit<BotSettings, 'updatedAt'>,
): Promise<SavedBotSettings> {
  return request<SavedBotSettings>('/api/settings', {
    method: 'PUT',
    body: settings,
    onStatus: {
      422: (payload) => {
        const data = payload as { code?: string; field?: string } | null;
        return new SettingsRejectedError(
          data?.code ?? 'unknown',
          data?.field ?? '',
        );
      },
    },
  });
}
