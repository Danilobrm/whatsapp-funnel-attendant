import { UnauthorizedError } from "../errors/auth.errors.js";
import { signAuthToken } from "../utils/jwt.js";
import { findUserByEmail, findUserById } from "../repositories/auth.repository.js";
import { verifyPassword } from "../utils/password.js";

import type { AuthUser, LoginResult } from "../types/auth.types.js";

/**
 * Hash bcrypt fixo de uma senha aleatória. Serve só para gastar o mesmo tempo
 * de CPU quando o e-mail não existe: sem isso o endpoint responderia bem mais
 * rápido para e-mail inexistente do que para senha errada, virando um oráculo
 * de "esta pessoa tem conta aqui".
 *
 * Gerado sobre 32 bytes aleatórios descartados — não existe texto claro que
 * case com ele, então nunca autentica ninguém por acidente.
 */
const DUMMY_HASH =
  "$2b$10$W74hLjjXbKEhm7WaNQ7GauYZ22/v6Uvdj9rrdJF4TwGgLAlD0Qr9u";

function toAuthUser(user: AuthUser): AuthUser {
  return { id: user.id, email: user.email, tenant: user.tenant };
}

interface LoginInput {
  email?: unknown;
  password?: unknown;
}

export async function login(input: unknown): Promise<LoginResult> {
  const { email, password } = (input ?? {}) as LoginInput;

  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const plainPassword = typeof password === "string" ? password : "";

  // Campo vazio é credencial inválida, não erro de validação: distinguir os
  // dois já entrega ao atacante metade da resposta.
  if (normalizedEmail === "" || plainPassword === "") {
    throw new UnauthorizedError("invalid_credentials");
  }

  const user = await findUserByEmail(normalizedEmail);
  const matches = await verifyPassword(
    plainPassword,
    user?.passwordHash ?? DUMMY_HASH,
  );

  if (user === null || !matches) {
    throw new UnauthorizedError("invalid_credentials");
  }

  const token = signAuthToken({ userId: user.id, tenantId: user.tenant.id });
  return { token, user: toAuthUser(user) };
}

/**
 * Relê o usuário do token. O frontend chama no boot para descobrir que uma
 * sessão guardada no localStorage já morreu, em vez de renderizar `/admin` até
 * a primeira chamada de API falhar.
 */
export async function currentUser(userId: number): Promise<AuthUser> {
  const user = await findUserById(userId);
  if (user === null) {
    // Token válido de um usuário que não existe mais (tenant removido).
    throw new UnauthorizedError("invalid_token");
  }
  return toAuthUser(user);
}
