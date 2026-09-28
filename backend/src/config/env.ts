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
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  whatsapp: WhatsAppEnv;
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
