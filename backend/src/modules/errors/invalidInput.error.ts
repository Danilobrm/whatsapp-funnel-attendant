/**
 * Campo obrigatório ausente no corpo da requisição.
 *
 * Existe porque `throw new Error("texto é obrigatório")` caía no fallback
 * genérico do `errorHandler`: erro de input do cliente virava HTTP 500 com
 * texto pt-BR congelado no serviço — status errado e i18n morto. Aqui o
 * contrato é `code` + `field`; o frontend renderiza `errors.<code>`.
 */
export type InvalidInputCode = "text_required" | "text_too_long";

export class InvalidInputError extends Error {
  readonly code: InvalidInputCode;
  readonly field: string;

  constructor(code: InvalidInputCode, field: string) {
    super(`invalid_input:${code}`);
    this.name = "InvalidInputError";
    this.code = code;
    this.field = field;
  }
}
