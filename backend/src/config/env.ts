const databaseUrlFromParts =
  `postgresql://${process.env.PGUSER || "postgres"}:${process.env.PGPASSWORD || "postgrespassword"}` +
  `@${process.env.PGHOST || "localhost"}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE || "attendant_db"}`;

/**
 * Segredo de desenvolvimento. Existe para que `npm run dev` e os testes
 * funcionem sem `.env`, e é explicitamente rejeitado em produção por
 * `assertProductionSecrets()`.
 */
export const DEV_JWT_SECRET = "dev-insecure-jwt-secret-change-me-please";

/** Tamanho mínimo exigido do segredo em produção (HS256). */
export const MIN_JWT_SECRET_LENGTH = 32;

export interface Env {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  /**
   * Timeout do modelo de chat. Fica no hot path da conversa (o cliente está
   * esperando no WhatsApp), então é curto: melhor cair no fallback da persona
   * do que deixar a mensagem sem resposta por minutos.
   */
  ollamaTimeoutMs: number;
  llm: LlmEnv;
  /**
   * Base pública do frontend, onde vive a página do cardápio (`/c/<token>`).
   * Vazia em produção = `send_menu_link` indisponível e o agente pede pelo chat.
   */
  publicAppUrl: string;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  whatsapp: WhatsAppEnv;
  osm: OsmEnv;
  google: GoogleEnv;
}

export const LLM_PROVIDERS = [
  "ollama",
  "anthropic",
  "openai",
  "gemini",
] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/**
 * Provedor do modelo do agente. Ollama é o default de dev; tool calling com
 * modelo pequeno local é instável, então o piloto com restaurante real usa um
 * modelo hospedado (`anthropic` ou `openai`). `timeoutMs` vale POR chamada ao
 * modelo; o laço de ferramentas tem um prazo total próprio (ver `agent.loop`).
 */
export interface LlmEnv {
  provider: LlmProvider;
  model: string;
  timeoutMs: number;
  anthropicApiKey: string;
  openaiApiKey: string;
  geminiApiKey: string;
}

const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProvider, string> = {
  ollama: process.env.OLLAMA_MODEL || "llama3.2",
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
};

function parseLlmProvider(raw: string | undefined): LlmProvider {
  const value = (raw || "ollama").trim().toLowerCase();
  if ((LLM_PROVIDERS as readonly string[]).includes(value)) {
    return value as LlmProvider;
  }
  throw new Error(
    `LLM_PROVIDER inválido: "${raw}". Use ${LLM_PROVIDERS.join(", ")}.`,
  );
}

const llmProvider = parseLlmProvider(process.env.LLM_PROVIDER);

/**
 * OpenStreetMap — contorno da cidade e dos bairros atendidos (aba Entrega).
 * Só é chamado quando o dono escolhe/troca a cidade; o resultado fica salvo
 * em `store_geo`, então nada disso está no caminho de uma resposta ao cliente.
 * Nominatim e Overpass exigem um User-Agent identificável.
 */
export interface OsmEnv {
  nominatimUrl: string;
  /** Tentados em ordem — instâncias públicas do Overpass vivem ocupadas. */
  overpassUrls: string[];
  userAgent: string;
  timeoutMs: number;
}

/**
 * Google Geocoding — botão "Localizar pelo endereço" (aba Geral). Chave de
 * SERVIDOR (restrita por IP), separada da chave de navegador do mapa. Sem ela,
 * a busca responde `geo_unavailable`; o resto do painel segue funcionando.
 */
export interface GoogleEnv {
  geocodingApiKey: string;
  timeoutMs: number;
}

/**
 * WhatsApp Cloud API (Meta). Tudo opcional em dev: sem `accessToken` o envio é
 * desligado e só o simulador funciona; sem `appSecret` o webhook recusa toda
 * requisição (falha fechada — ver `whatsapp.signature.ts`).
 */
export interface WhatsAppEnv {
  /** Token que você inventa e cola no painel da Meta ao registrar o webhook. */
  verifyToken: string;
  /** App Secret do app Meta — assina o corpo do webhook (X-Hub-Signature-256). */
  appSecret: string;
  /** Token de System User com permissão whatsapp_business_messaging. */
  accessToken: string;
  graphApiVersion: string;
  timeoutMs: number;
}

export const env: Env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  databaseUrl: process.env.DATABASE_URL || databaseUrlFromParts,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "llama3.2",
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 30000),
  publicAppUrl: (
    process.env.PUBLIC_APP_URL ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:5173")
  ).replace(/\/+$/, ""),
  llm: {
    provider: llmProvider,
    model: process.env.LLM_MODEL || DEFAULT_MODEL_BY_PROVIDER[llmProvider],
    timeoutMs: Number(
      process.env.LLM_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || 30000,
    ),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
  },
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
  jwtExpiresInSeconds: Number(
    process.env.JWT_EXPIRES_IN_SECONDS || 8 * 60 * 60,
  ),
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0",
    timeoutMs: Number(process.env.WHATSAPP_TIMEOUT_MS || 10000),
  },
  osm: {
    nominatimUrl:
      process.env.OSM_NOMINATIM_URL || "https://nominatim.openstreetmap.org",
    overpassUrls: (
      process.env.OSM_OVERPASS_URLS ||
      "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter"
    )
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean),
    userAgent: process.env.OSM_USER_AGENT || "attendant/1.0 (restaurant panel)",
    timeoutMs: Number(process.env.OSM_TIMEOUT_MS || 60000),
  },
  google: {
    geocodingApiKey: process.env.GOOGLE_GEOCODING_API_KEY || "",
    timeoutMs: Number(process.env.GOOGLE_TIMEOUT_MS || 10000),
  },
};

/**
 * Falha alto no boot quando produção sobe com segredo de desenvolvimento.
 *
 * É função, e não `throw` no topo do módulo, de propósito: `env.ts` é dado puro
 * importado por dezenas de arquivos (inclusive testes), e um throw no import
 * viraria mina terrestre. `src/index.ts` chama isto antes de subir o servidor.
 */
export function assertProductionSecrets(): void {
  if (env.nodeEnv !== "production") return;

  if (!process.env.JWT_SECRET || env.jwtSecret === DEV_JWT_SECRET) {
    throw new Error(
      "JWT_SECRET é obrigatório em produção — o valor de desenvolvimento é público.",
    );
  }
  if (env.jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET precisa de pelo menos ${MIN_JWT_SECRET_LENGTH} caracteres.`,
    );
  }
}
