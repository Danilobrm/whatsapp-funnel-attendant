import bcrypt from "bcryptjs";

/**
 * Custo do bcrypt. 10 rodadas ≈ 50 ms nesta máquina — caro o bastante para
 * força bruta, barato o bastante para um login interativo.
 */
const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Nunca lança: um hash corrompido no banco vira `false`, não 500. Login com
 * credencial inválida é fluxo esperado, não falha de servidor.
 */
export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
