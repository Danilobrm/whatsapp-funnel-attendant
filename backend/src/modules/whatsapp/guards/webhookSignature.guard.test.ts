import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

const SECRET = "test-app-secret";

vi.mock("../../../config/env.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../config/env.js")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      whatsapp: { ...actual.env.whatsapp, appSecret: SECRET },
    },
  };
});

const { WebhookSignatureGuard } = await import("./webhookSignature.guard.js");

const sign = (body: Buffer) =>
  `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

function ctx(rawBody: Buffer | undefined, signature?: string) {
  const req = {
    rawBody,
    get: (name: string) =>
      name.toLowerCase() === "x-hub-signature-256" ? signature : undefined,
  };
  return { switchToHttp: () => ({ getRequest: () => req }) } as never;
}

describe("WebhookSignatureGuard", () => {
  const guard = new WebhookSignatureGuard();

  it("accepts a signature computed over the raw bytes", () => {
    const raw = Buffer.from('{"a":1,  "b":"é"}');

    expect(guard.canActivate(ctx(raw, sign(raw)))).toBe(true);
  });

  it("rejects a wrong signature with invalid_signature", () => {
    expect(() =>
      guard.canActivate(ctx(Buffer.from("{}"), "sha256=deadbeef")),
    ).toThrowError(expect.objectContaining({ code: "invalid_signature" }));
  });

  it("rejects a missing header and a missing raw body (fail closed)", () => {
    const raw = Buffer.from("{}");

    expect(() => guard.canActivate(ctx(raw, undefined))).toThrow();
    expect(() => guard.canActivate(ctx(undefined, sign(raw)))).toThrow();
  });

  it("rejects a signature over JSON.stringify(body) when the bytes differ", () => {
    const raw = Buffer.from('{"a":1,  "b":2}');
    const reserialized = Buffer.from(
      JSON.stringify(JSON.parse(raw.toString())),
    );

    expect(() => guard.canActivate(ctx(raw, sign(reserialized)))).toThrow();
  });
});
