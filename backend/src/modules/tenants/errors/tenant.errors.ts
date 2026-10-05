/**
 * Nenhum tenant para o identificador recebido. Mapeado para 404 no
 * `mapError` quando chega a uma rota HTTP; no webhook é só logado, porque a
 * Meta não tem o que fazer com um 404.
 */
export class TenantNotFoundError extends Error {
  readonly key: string | null;

  constructor(key: string | null) {
    super(`Tenant não encontrado: ${key ?? "(vazio)"}`);
    this.name = "TenantNotFoundError";
    this.key = key;
  }
}
