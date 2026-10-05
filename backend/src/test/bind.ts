/**
 * Devolve os métodos pedidos já amarrados à instância, para o teste chamar
 * `findX(...)` direto (o corpo dos testes de repository/service continua igual
 * ao de quando eram funções soltas).
 */
export function bound<T extends object, K extends keyof T>(
  instance: T,
  keys: readonly K[],
): { [P in K]: T[P] } {
  const out = {} as { [P in K]: T[P] };
  for (const key of keys) {
    const member = instance[key];
    out[key] = (
      typeof member === "function" ? member.bind(instance) : member
    ) as T[K];
  }
  return out;
}
