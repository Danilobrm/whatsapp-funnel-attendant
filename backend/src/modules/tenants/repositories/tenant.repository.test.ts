import { beforeEach, describe, expect, it, vi } from "vitest";

import { TenantRepository } from "./tenant.repository.js";

import type { Database } from "../../../common/database/database.js";

const query = vi.fn();
const repository = new TenantRepository({ query } as unknown as Database);
const { findTenantById, findTenantByWhatsAppPhoneNumberId } = {
  findTenantById: repository.findTenantById.bind(repository),
  findTenantByWhatsAppPhoneNumberId:
    repository.findTenantByWhatsAppPhoneNumberId.bind(repository),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("findTenantByWhatsAppPhoneNumberId", () => {
  it("filtra pelo phone_number_id e marca o id", async () => {
    query.mockResolvedValue({
      rows: [{ id: 3, slug: "pizzaria-demo", name: "Pizzaria Demo" }],
    });

    await expect(
      findTenantByWhatsAppPhoneNumberId("1234567890"),
    ).resolves.toEqual({ id: 3, slug: "pizzaria-demo", name: "Pizzaria Demo" });
    expect(query.mock.calls[0]?.[0]).toContain(
      "WHERE whatsapp_phone_number_id = $1",
    );
    expect(query.mock.calls[0]?.[1]).toEqual(["1234567890"]);
  });

  it("devolve null quando não existe", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(findTenantByWhatsAppPhoneNumberId("999")).resolves.toBeNull();
  });
});

describe("findTenantById", () => {
  it("filtra por id", async () => {
    query.mockResolvedValue({ rows: [] });

    await findTenantById(9 as never);

    expect(query.mock.calls[0]?.[0]).toContain("WHERE id = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([9]);
  });
});
