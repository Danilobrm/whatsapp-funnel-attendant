import { Injectable, Logger } from "@nestjs/common";

import { CustomerRepository } from "../repositories/customer.repository.js";
import { customerPhoneFor } from "../utils/customer.phone.js";

import type { Channel } from "../../conversation/types/conversation.types.js";
import type { TenantId } from "../../tenants/types/tenant.types.js";
import type { Customer } from "../types/customer.types.js";

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(private readonly customers: CustomerRepository) {}

  /**
   * Garante o cliente da conversa (criado/atualizado a cada mensagem). Falha
   * aqui NUNCA derruba a resposta ao cliente: sem cadastro o agente só perde o
   * contexto de cliente recorrente.
   */
  async resolveCustomer(
    tenantId: TenantId,
    channel: Channel,
    contact: string,
    contactName: string | null,
  ): Promise<Customer | null> {
    try {
      return await this.customers.upsertCustomer(
        tenantId,
        customerPhoneFor(channel, contact),
        contactName,
      );
    } catch (err) {
      this.logger.error(
        `Falha ao registrar o cliente: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
