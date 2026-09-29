import type { Tenant } from "../../tenants/types/tenant.types.js";

/** Usuário como o frontend o vê. Nunca carrega `password_hash`. */
export interface AuthUser {
  id: number;
  email: string;
  tenant: Tenant;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

/** Payload assinado no JWT. Só identificadores — nada de PII. */
export interface AuthTokenPayload {
  userId: number;
  tenantId: number;
}

/** Contexto que `requireAuth` pendura em `req.auth`. */
export interface RequestAuth {
  userId: number;
  tenantId: import("../../tenants/types/tenant.types.js").TenantId;
}
