import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn() };
});

const fsPromises = await import("node:fs/promises");
const crypto = await import("node:crypto");
const { ProductImageStorage, ALLOWED_IMAGE_MIME_TYPES } =
  await import("./imageStorage.js");
const storage = new ProductImageStorage();
const saveProductImage = storage.saveProductImage.bind(storage);
const productImagesDir = storage.productImagesDir.bind(storage);

const mkdir = fsPromises.mkdir as unknown as ReturnType<typeof vi.fn>;
const writeFile = fsPromises.writeFile as unknown as ReturnType<typeof vi.fn>;
const randomUUID = crypto.randomUUID as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  randomUUID.mockReturnValue("11111111-1111-1111-1111-111111111111");
});

describe("productImagesDir", () => {
  it("é <backend>/produtos — a pasta do package.json, não uma subpasta de src/", () => {
    const backendRoot = dirname(productImagesDir());

    expect(existsSync(join(backendRoot, "package.json"))).toBe(true);
    expect(basename(productImagesDir())).toBe("produtos");
  });
});

describe("saveProductImage", () => {
  it("grava em produtos/ com um nome gerado, nunca o nome do cliente", async () => {
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    const buffer = Buffer.from("fake-image-bytes");

    const result = await saveProductImage(buffer, "image/png");

    expect(mkdir).toHaveBeenCalledWith(productImagesDir(), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("11111111-1111-1111-1111-111111111111.png"),
      buffer,
    );
    expect(result.url).toBe(
      "/produtos/11111111-1111-1111-1111-111111111111.png",
    );
  });

  it.each([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
  ])("usa a extensão certa pra %s", async (mimeType, extension) => {
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);

    const result = await saveProductImage(Buffer.from("x"), mimeType);

    expect(result.url.endsWith(extension)).toBe(true);
  });

  it("a URL devolvida nunca inclui o diretório de disco, só o caminho público", async () => {
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);

    const result = await saveProductImage(Buffer.from("x"), "image/png");

    expect(result.url).not.toContain(productImagesDir());
    expect(result.url.startsWith("/produtos/")).toBe(true);
  });
});

describe("ALLOWED_IMAGE_MIME_TYPES", () => {
  it("cobre os formatos comuns de foto de celular", () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(
      expect.arrayContaining(["image/jpeg", "image/png", "image/webp"]),
    );
  });
});
