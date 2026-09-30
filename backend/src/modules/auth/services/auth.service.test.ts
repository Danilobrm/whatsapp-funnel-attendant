import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = { findUserByEmail: vi.fn(), findUserById: vi.fn() };
const { verifyAuthToken } = await import("../utils/jwt.js");
const { hashPassword } = await import("../utils/password.js");
const { UnauthorizedError } = await import("../errors/auth.errors.js");
const { AuthService } = await import("./auth.service.js");
const service = new AuthService(repository as never);
const login = service.login.bind(service);
const currentUser = service.currentUser.bind(service);

const findUserByEmail = repository.findUserByEmail as unknown as ReturnType<
  typeof vi.fn
>;
const findUserById = repository.findUserById as unknown as ReturnType<
  typeof vi.fn
>;

const TENANT = { id: 4, slug: "pizzaria-demo", name: "Pizzaria Demo" };

async function storedUser() {
  return {
    id: 11,
    email: "danilo@admin.com",
    passwordHash: await hashPassword("123456"),
    tenant: TENANT,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("login", () => {
  it("devolve token e usuário sem vazar o hash", async () => {
    findUserByEmail.mockResolvedValue(await storedUser());

    const result = await login({
      email: "danilo@admin.com",
      password: "123456",
    });

    expect(result.user).toEqual({
      id: 11,
      email: "danilo@admin.com",
      tenant: TENANT,
    });
    expect(JSON.stringify(result)).not.toContain("$2");
  });

  it("assina o tenant do usuário no token", async () => {
    findUserByEmail.mockResolvedValue(await storedUser());

    const { token } = await login({
      email: "danilo@admin.com",
      password: "123456",
    });

    expect(verifyAuthToken(token)).toEqual({
      ok: true,
      payload: { userId: 11, tenantId: 4 },
    });
  });

  it("normaliza o e-mail antes de buscar", async () => {
    findUserByEmail.mockResolvedValue(await storedUser());

    await login({ email: "  Danilo@Admin.COM  ", password: "123456" });

    expect(findUserByEmail).toHaveBeenCalledWith("danilo@admin.com");
  });

  it("não enumera usuários: e-mail desconhecido e senha errada dão o mesmo code", async () => {
    findUserByEmail.mockResolvedValue(null);
    const unknownEmail = await login({
      email: "ninguem@admin.com",
      password: "123456",
    }).catch((error: unknown) => error);

    findUserByEmail.mockResolvedValue(await storedUser());
    const wrongPassword = await login({
      email: "danilo@admin.com",
      password: "senha-errada",
    }).catch((error: unknown) => error);

    expect(unknownEmail).toBeInstanceOf(UnauthorizedError);
    expect(wrongPassword).toBeInstanceOf(UnauthorizedError);
    expect((unknownEmail as InstanceType<typeof UnauthorizedError>).code).toBe(
      "invalid_credentials",
    );
    expect((wrongPassword as InstanceType<typeof UnauthorizedError>).code).toBe(
      "invalid_credentials",
    );
  });

  it.each([
    ["corpo vazio", {}],
    ["sem senha", { email: "danilo@admin.com" }],
    ["senha vazia", { email: "danilo@admin.com", password: "" }],
    ["e-mail vazio", { email: "   ", password: "123456" }],
    ["tipos errados", { email: 42, password: true }],
  ])("rejeita %s como credencial inválida", async (_label, body) => {
    findUserByEmail.mockResolvedValue(await storedUser());

    await expect(login(body)).rejects.toMatchObject({
      code: "invalid_credentials",
    });
  });
});

describe("currentUser", () => {
  it("relê o usuário pelo id do token", async () => {
    findUserById.mockResolvedValue(await storedUser());

    await expect(currentUser(11)).resolves.toEqual({
      id: 11,
      email: "danilo@admin.com",
      tenant: TENANT,
    });
  });

  it("trata token de usuário removido como inválido", async () => {
    findUserById.mockResolvedValue(null);

    await expect(currentUser(11)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });
});
