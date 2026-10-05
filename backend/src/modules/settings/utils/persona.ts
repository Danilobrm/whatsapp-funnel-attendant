import { InvalidSettingsError } from "../errors/settings.errors.js";
import {
  BOT_GENDERS,
  BOT_PERSONALITIES,
  SUPPORTED_LANGUAGES,
  type BotGender,
  type BotPersonality,
  type BotSettings,
  type BotSettingsOptions,
} from "../types/settings.types.js";

export const MAX_BOT_NAME_CHARS = 60;

export const DEFAULT_BOT_SETTINGS: BotSettings = {
  name: "Assistente",
  personality: "friendly",
  gender: "neutral",
  languages: ["pt-BR"],
};

function isPersonality(value: unknown): value is BotPersonality {
  return BOT_PERSONALITIES.includes(value as BotPersonality);
}

function isGender(value: unknown): value is BotGender {
  return BOT_GENDERS.includes(value as BotGender);
}

/**
 * Valida a entrada da UI. Puro — não toca no banco, então serve tanto ao
 * endpoint quanto aos testes sem infra.
 */
export function parseBotSettings(
  input: unknown,
): Omit<BotSettings, "updatedAt"> {
  const raw = (input ?? {}) as Record<string, unknown>;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length === 0) {
    throw new InvalidSettingsError("name_required", "name");
  }
  if (name.length > MAX_BOT_NAME_CHARS) {
    throw new InvalidSettingsError("name_too_long", "name");
  }

  if (!isPersonality(raw.personality)) {
    throw new InvalidSettingsError("unknown_personality", "personality");
  }
  if (!isGender(raw.gender)) {
    throw new InvalidSettingsError("unknown_gender", "gender");
  }

  const languages = Array.isArray(raw.languages)
    ? [
        ...new Set(
          raw.languages.filter((l): l is string => typeof l === "string"),
        ),
      ]
    : [];

  if (languages.length === 0) {
    throw new InvalidSettingsError("languages_required", "languages");
  }
  for (const language of languages) {
    if (!SUPPORTED_LANGUAGES.includes(language as never)) {
      throw new InvalidSettingsError("unsupported_language", "languages");
    }
  }

  return { name, personality: raw.personality, gender: raw.gender, languages };
}

/**
 * Substantivo com o gênero escolhido. "atendente" é comum de dois gêneros em
 * pt-BR, então o gênero aparece no artigo; neutro simplesmente não usa artigo.
 */
function roleNoun(gender: BotGender): string {
  switch (gender) {
    case "female":
      return "a atendente virtual";
    case "male":
      return "o atendente virtual";
    default:
      return "atendente virtual";
  }
}

interface PersonaTemplate {
  greeting: (name: string, role: string) => string;
  /** "Quem é você?" — identidade vem de `bot_settings`, nunca do agente. */
  identity: (name: string, role: string) => string;
  /** O agente não conseguiu ajudar (ou falhou) — a equipe assume. */
  fallback: string;
  /** Mensagem sem conteúdo aproveitável no início da conversa. */
  junk: string;
}

// Texto que o bot escreve por conta própria, sem LLM. Cobre só a abertura da
// conversa, a identidade e as saídas de erro — o resto é do agente.
const PERSONA_TEMPLATES: Record<BotPersonality, PersonaTemplate> = {
  friendly: {
    greeting: (name, role) =>
      `Oi! Eu sou ${name}, ${role}. Posso anotar seu pedido ou tirar dúvidas sobre o cardápio. O que vai ser hoje?`,
    identity: (name, role) =>
      `Eu sou ${name}, ${role} daqui. Anoto pedidos e respondo sobre o cardápio. Se precisar, chamo alguém da equipe!`,
    fallback:
      "Não consegui resolver isso por aqui. Já avisei a equipe e alguém te responde em instantes.",
    junk: "Não consegui entender. Pode me dizer o que você gostaria de pedir?",
  },
  formal: {
    greeting: (name, role) =>
      `Olá. Sou ${name}, ${role}. Posso registrar seu pedido ou esclarecer dúvidas sobre o cardápio.`,
    identity: (name, role) =>
      `Sou ${name}, ${role}. Registro pedidos e informo sobre o cardápio; quando necessário, encaminho à equipe.`,
    fallback:
      "Não foi possível concluir o atendimento por aqui. A equipe foi notificada e retornará em breve.",
    junk: "Não foi possível compreender a mensagem. Por gentileza, informe o que deseja pedir.",
  },
  objective: {
    greeting: (name, role) => `Sou ${name}, ${role}. Qual o seu pedido?`,
    identity: (name, role) => `${name}, ${role}.`,
    fallback: "Não consegui resolver. Equipe avisada.",
    junk: "Não entendi. Qual o seu pedido?",
  },
  technical: {
    greeting: (name, role) =>
      `Olá. Sou ${name}, ${role}. Informe os itens, quantidades e se é entrega ou retirada.`,
    identity: (name, role) =>
      `Sou ${name}, ${role}. Registro pedidos com base no cardápio cadastrado pelo restaurante.`,
    fallback:
      "Não consegui processar a solicitação com as informações disponíveis. Encaminhei para a equipe.",
    junk: "Mensagem sem conteúdo suficiente. Informe os itens e as quantidades desejadas.",
  },
};

export interface PersonaTexts {
  greeting: string;
  identity: string;
  fallback: string;
  junk: string;
}

/** Textos autorais do bot derivados da persona. Determinístico, sem LLM. */
export function buildPersonaTexts(settings: BotSettings): PersonaTexts {
  const template = PERSONA_TEMPLATES[settings.personality];
  const name = settings.name.trim() || DEFAULT_BOT_SETTINGS.name;

  const role = roleNoun(settings.gender);

  return {
    greeting: template.greeting(name, role),
    identity: template.identity(name, role),
    fallback: template.fallback,
    junk: template.junk,
  };
}

export function settingsOptions(): BotSettingsOptions {
  return {
    personalities: BOT_PERSONALITIES,
    genders: BOT_GENDERS,
    languages: SUPPORTED_LANGUAGES,
  };
}
