/**
 * Porteiro da conversa: classifica a mensagem ANTES de gastar LLM. Saudação,
 * pergunta de identidade e lixo têm resposta determinística vinda da persona
 * (`bot_settings`); só o que sobra ("meaningful") segue para o agente.
 *
 * Regra da casa: guardrail RETORNA, não lança. Quem chama decide o que fazer.
 */
export type Intent = "greeting" | "business";

export interface IntentResult {
  intent: Intent;
}

const GREETING_TERMS = [
  "oi",
  "ola",
  "opa",
  "eae",
  "e ai",
  "hey",
  "hello",
  "hi",
  "bom dia",
  "boa tarde",
  "boa noite",
  "tudo bem",
  "tudo bem com voce",
  "tudo bom",
  "como vai",
  "como voce esta",
  "como esta",
  "como vai voce",
  "beleza",
  "de boa",
  "obrigado",
  "obrigada",
  "valeu",
  "vlw",
  "tchau",
  "ate mais",
  "ate logo",
  "falou",
];

const GREETING_FILLER = new Set([
  "voce",
  "vc",
  "tu",
  "te",
  "ai",
  "cara",
  "amigo",
  "amiga",
  "moco",
  "moca",
  "gente",
  "pessoal",
  "sim",
  "nao",
  "ok",
  "beleza",
  "e",
  "por",
  "com",
  "de",
  "a",
  "o",
]);

// Pontuação vira espaço em QUALQUER posição, não só no fim: "Oi, tudo bem?"
// precisa normalizar para "oi tudo bem", senão o token residual "bem?" (ou
// "oi,") sobrevive ao `stripGreetingTerms` e a saudação é classificada como
// pergunta de negócio — e gasta uma chamada de LLM à toa.
export function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldBlockMessage(message: unknown): boolean {
  return typeof message !== "string" || message.trim().length === 0;
}

function stripGreetingTerms(normalized: string): string {
  let out = ` ${normalized} `;
  const ordered = [...GREETING_TERMS].sort((a, b) => b.length - a.length);
  for (const term of ordered) {
    out = out.replaceAll(` ${term} `, " ");
  }
  return out.trim().replace(/\s+/g, " ");
}

function residualContent(normalized: string): string[] {
  const stripped = stripGreetingTerms(normalized);
  if (!stripped) return [];
  return stripped
    .split(" ")
    .filter((w) => w.length >= 2 && !GREETING_FILLER.has(w));
}

export function classifyIntent(message: string): IntentResult {
  const normalized = normalize(message);

  if (normalized.length === 0) {
    return { intent: "business" };
  }

  const residual = residualContent(normalized);

  if (residual.length === 0) {
    const touchedGreeting = stripGreetingTerms(normalized) !== normalized;
    if (touchedGreeting) {
      return { intent: "greeting" };
    }
  }

  return { intent: "business" };
}

const JUNK_TERMS = new Set([
  "beleza",
  "blz",
  "tmj",
  "kkk",
  "kkkk",
  "kkkkk",
  "rsrs",
  "rsrsrs",
  "haha",
  "hahaha",
  "hehe",
  "teste",
  "test",
  "testando",
  "aleatorio",
  "qualquer coisa",
  "sla",
  "nada",
  "nao sei",
  "sei la",
  "tanto faz",
  "whatever",
]);

const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\s]+$/u;

const CONTENT_STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "pra",
  "por",
  "com",
  "sem",
  "que",
  "se",
  "um",
  "uma",
  "uns",
  "umas",
  "eu",
  "voce",
  "tu",
  "ele",
  "ela",
  "nos",
  "vos",
  "meu",
  "sua",
  "seu",
  "the",
  "of",
  "and",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "you",
]);

function isJunk(normalized: string): boolean {
  if (JUNK_TERMS.has(normalized)) return true;
  const stripped = normalized.replace(/[^a-z0-9\s]/g, "").trim();
  return JUNK_TERMS.has(stripped);
}

function contentTokens(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length >= 2 && !CONTENT_STOPWORDS.has(w));
}

// ---------------------------------------------------------------------------
// Identidade do bot
//
// "Qual seu nome?" é sobre o bot, não sobre o negócio: a resposta vem de
// `bot_settings` (ver `modules/settings`), nunca do agente — o LLM inventaria
// um nome, e qualquer texto com o nome fixo fica stale no primeiro rename.
//
// Padrões deliberadamente estreitos: exigem pronome de 2ª pessoa ou o próprio
// substantivo "bot/assistente/atendente/chatbot". "Qual o nome do sistema?" e "Qual seu
// horário?" TÊM que continuar chegando ao agente.
// ---------------------------------------------------------------------------
const IDENTITY_PATTERNS = [
  /\bqual (?:e |eh )?(?:o )?(?:seu|teu) nome\b/,
  /\bcomo (?:voce |vc |tu )?se chama\b/,
  /\bquem (?:e|eh) (?:voce|vc|tu)\b/,
  /\bqual (?:e )?(?:o |a )?(?:nome|seu nome) (?:do|da) (?:bot|robo|assistente|atendente|chatbot)\b/,
  /\b(?:voce|vc) (?:e|eh) (?:um|uma) (?:bot|robo|robot|ia|inteligencia artificial|maquina|humano|pessoa)\b/,
  /\bseu nome (?:e|eh) qual\b/,
];

function isIdentityQuestion(normalized: string): boolean {
  return IDENTITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export type MessageQuality = "meaningful" | "junk" | "greeting" | "identity";

export interface MessageQualityResult {
  kind: MessageQuality;
  reason?:
    | "greeting"
    | "identity"
    | "emoji_only"
    | "no_content"
    | "blocklist"
    | "too_short";
}

const MIN_MEANINGFUL_CHARS = 3;

export function classifyMessage(message: string): MessageQualityResult {
  const raw = (message ?? "").trim();
  if (raw.length === 0) {
    return { kind: "junk", reason: "no_content" };
  }
  if (EMOJI_ONLY.test(raw)) {
    return { kind: "junk", reason: "emoji_only" };
  }

  // Greeting antes de too_short: "oi"/"hi" têm 2 chars mas são saudações
  // válidas que devem receber canned reply, não fallback de junk.
  const intent = classifyIntent(raw);
  if (intent.intent === "greeting") {
    return { kind: "greeting", reason: "greeting" };
  }

  // Depois de greeting ("tudo bem, qual seu nome?" é identidade, não saudação)
  // e antes de junk/agente — a resposta sai de bot_settings sem LLM.
  if (isIdentityQuestion(normalize(raw))) {
    return { kind: "identity", reason: "identity" };
  }

  if (raw.length < MIN_MEANINGFUL_CHARS) {
    return { kind: "junk", reason: "too_short" };
  }

  const normalized = normalize(raw);
  if (isJunk(normalized)) {
    return { kind: "junk", reason: "blocklist" };
  }

  if (contentTokens(raw).length === 0) {
    return { kind: "junk", reason: "no_content" };
  }

  return { kind: "meaningful" };
}
