/**
 * Contrato da persona do atendente.
 *
 * Governa os textos determinísticos (saudação, identidade, fallback, entrada
 * inválida) e o tom que o agente deve seguir. Nunca um prefixo fixo em toda
 * resposta: uma abertura repetida soa robótica.
 */
export const BOT_PERSONALITIES = [
  "friendly",
  "formal",
  "objective",
  "technical",
] as const;

export type BotPersonality = (typeof BOT_PERSONALITIES)[number];

export const BOT_GENDERS = ["neutral", "female", "male"] as const;

export type BotGender = (typeof BOT_GENDERS)[number];

/**
 * Idiomas que o bot pode falar. Hoje só pt-BR está disponível — adicionar um
 * idioma é acrescentar o código aqui + os templates da persona.
 */
export const SUPPORTED_LANGUAGES = ["pt-BR"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export interface BotSettings {
  name: string;
  personality: BotPersonality;
  gender: BotGender;
  languages: string[];
  updatedAt?: string | null;
}

export interface BotSettingsOptions {
  personalities: readonly BotPersonality[];
  genders: readonly BotGender[];
  languages: readonly SupportedLanguage[];
}
