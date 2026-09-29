/**
 * Erros de autenticação/autorização. Uma classe por status HTTP, conforme a
 * regra `error-handling.md` — o `errorHandler` ganha um branch por classe.
 *
 * O `code` é o contrato com o frontend (`login.errors.<code>`). As mensagens
 * destas classes NUNCA vão para a resposta: seriam texto pt-BR congelado no
 * serviço, o que mata o i18n, e o de `invalid_credentials` daria pistas sobre
 * qual metade da credencial estava errada.
 */
export type UnauthorizedCode =
  | "missing_token"
  | "invalid_token"
  | "expired_token"
  | "invalid_credentials"
  /** Link do cardápio adulterado, de outro propósito ou de conversa que não existe mais. */
  | "invalid_menu_link"
  | "expired_menu_link";

export class UnauthorizedError extends Error {
  readonly code: UnauthorizedCode;

  constructor(code: UnauthorizedCode) {
    super(`Não autenticado: ${code}`);
    this.name = "UnauthorizedError";
    this.code = code;
  }
}

export type ForbiddenCode =
  | "tenant_mismatch"
  /** Webhook do WhatsApp sem assinatura válida (X-Hub-Signature-256). */
  | "invalid_signature"
  /** Handshake do webhook com `hub.verify_token` diferente do configurado. */
  | "invalid_verify_token";

export class ForbiddenError extends Error {
  readonly code: ForbiddenCode;

  constructor(code: ForbiddenCode) {
    super(`Acesso negado: ${code}`);
    this.name = "ForbiddenError";
    this.code = code;
  }
}
