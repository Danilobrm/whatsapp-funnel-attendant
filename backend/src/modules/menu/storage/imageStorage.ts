import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * `backend/produtos/` — pasta local das fotos de item. Nome escolhido pelo
 * usuário, não "uploads" genérico. Quando isto for pra S3, só o corpo desta
 * função muda: a assinatura (`buffer` entra, `{ url }` sai) e o contrato com
 * quem chama (`menu.service`, o controller) ficam os mesmos.
 */
const STORAGE_DIR = resolve(__dirname, "../../../produtos");
const PUBLIC_PATH_PREFIX = "/produtos";

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(EXTENSION_BY_MIME_TYPE);

export interface StoredImage {
  /** Caminho público servido por `express.static` — vai direto em `menu_items.image_url`. */
  url: string;
}

/**
 * Grava a imagem em disco com um nome gerado (nunca o nome original do
 * cliente — evita path traversal e colisão) e devolve a URL pública.
 */
export async function saveProductImage(
  buffer: Buffer,
  mimeType: string,
): Promise<StoredImage> {
  await mkdir(STORAGE_DIR, { recursive: true });

  const extension = EXTENSION_BY_MIME_TYPE[mimeType] ?? extname(mimeType) ?? "";
  const filename = `${randomUUID()}${extension}`;

  await writeFile(resolve(STORAGE_DIR, filename), buffer);

  return { url: `${PUBLIC_PATH_PREFIX}/${filename}` };
}

/** Diretório servido estaticamente por `server.ts`. */
export function productImagesDir(): string {
  return STORAGE_DIR;
}
