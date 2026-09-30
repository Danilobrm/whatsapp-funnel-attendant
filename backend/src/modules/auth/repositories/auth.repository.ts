import { Injectable } from "@nestjs/common";

import { Database } from "../../../common/database/database.js";
import { asTenantId } from "../../tenants/types/tenant.types.js";

import type { AuthUser } from "../types/auth.types.js";

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  tenant_id: number;
  tenant_slug: string;
  tenant_name: string;
}

export interface StoredUser extends AuthUser {
  passwordHash: string;
}

function toStoredUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    tenant: {
      id: asTenantId(row.tenant_id),
      slug: row.tenant_slug,
      name: row.tenant_name,
    },
  };
}

const SELECT_USER = `SELECT u.id,
            u.email,
            u.password_hash,
            t.id   AS tenant_id,
            t.slug AS tenant_slug,
            t.name AS tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id`;

@Injectable()
export class AuthRepository {
  constructor(private readonly db: Database) {}

  /**
   * ATENÇÃO — este é o ÚNICO método de repositório de login do projeto que não recebe
   * `tenantId`, e é proposital: o login acontece ANTES de existir um tenant, e é
   * exatamente ele que descobre a qual tenant o usuário pertence. Toda outra
   * consulta precisa do escopo como primeiro argumento.
   */
  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const result = await this.db.query<UserRow>(
      `${SELECT_USER} WHERE lower(u.email) = $1`,
      [email],
    );

    const row = result.rows[0];
    return row ? toStoredUser(row) : null;
  }

  /**
   * Não usa `tenantQuery`: `userId` já é globalmente único (`users.id`), e é
   * exatamente esta consulta que devolve a qual tenant aquele usuário pertence
   * — não há `tenantId` prévio pra validar contra.
   */
  async findUserById(userId: number): Promise<StoredUser | null> {
    const result = await this.db.query<UserRow>(
      `${SELECT_USER} WHERE u.id = $1`,
      [userId],
    );

    const row = result.rows[0];
    return row ? toStoredUser(row) : null;
  }
}
