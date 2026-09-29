import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/**
 * Confere o `X-Hub-Signature-256` que a Meta manda em todo POST do webhook:
 * HMAC-SHA256 do corpo CRU com o App Secret.
 *
 * Falha FECHADA: sem App Secret configurado, sem corpo cru ou sem cabeçalho,
 * a resposta é `false`. O endpoint é público; sem esta checagem qualquer um
 * forjaria mensagens de clientes e faria o bot responder (e gastar LLM) em
 * nome do restaurante.
 *
 * O corpo precisa ser o buffer original — `JSON.stringify(req.body)` não
 * reproduz os bytes assinados (ordem de chaves, escapes de unicode).
 */
export function isValidSignature(
  rawBody: Buffer | undefined,
  header: unknown,
  appSecret: string,
): boolean {
  if (!appSecret || !rawBody || typeof header !== "string") return false;
  if (!header.startsWith(PREFIX)) return false;

  const received = Buffer.from(header.slice(PREFIX.length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();

  // timingSafeEqual lança com tamanhos diferentes — e comparar tamanho antes
  // não vaza nada, o tamanho do SHA-256 é público.
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
