export type InvalidSettingsCode =
  | "name_required"
  | "name_too_long"
  | "unknown_personality"
  | "unknown_gender"
  | "languages_required"
  | "unsupported_language";

/** Rejeição de configuração — mapeada para 422 em `mapError`. */
export class InvalidSettingsError extends Error {
  readonly code: InvalidSettingsCode;
  readonly field: string;

  constructor(code: InvalidSettingsCode, field: string) {
    super(`Configuração inválida: ${code}`);
    this.name = "InvalidSettingsError";
    this.code = code;
    this.field = field;
  }
}
