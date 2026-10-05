import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { env } from "../../../config/env.js";
import { readBearerAuth } from "./bearer.js";
import { signAuthToken } from "./jwt.js";

describe("readBearerAuth", () => {
  it("is `absent` without a Bearer header", () => {
    expect(readBearerAuth(undefined)).toEqual({ kind: "absent" });
    expect(readBearerAuth("Basic abc")).toEqual({ kind: "absent" });
    expect(readBearerAuth(["Bearer x"])).toEqual({ kind: "absent" });
  });

  it("returns the branded auth for a valid token", () => {
    const token = signAuthToken({ userId: 7, tenantId: 3 });

    expect(readBearerAuth(`Bearer ${token}`)).toEqual({
      kind: "ok",
      auth: { userId: 7, tenantId: 3 },
    });
  });

  it("maps a garbage token to invalid_token", () => {
    const result = readBearerAuth("Bearer lixo");

    expect(result).toMatchObject({
      kind: "error",
      error: { code: "invalid_token" },
    });
  });

  it("maps an expired token to expired_token", () => {
    const token = jwt.sign({ userId: 1, tenantId: 1 }, env.jwtSecret, {
      algorithm: "HS256",
      expiresIn: -10,
    });

    expect(readBearerAuth(`Bearer ${token}`)).toMatchObject({
      kind: "error",
      error: { code: "expired_token" },
    });
  });

  it("rejects an algorithm outside the HS256 allowlist", () => {
    const token = jwt.sign({ userId: 1, tenantId: 1 }, env.jwtSecret, {
      algorithm: "HS512",
      expiresIn: 60,
    });

    expect(readBearerAuth(`Bearer ${token}`)).toMatchObject({
      kind: "error",
      error: { code: "invalid_token" },
    });
  });

  it("rejects an unsigned (alg: none) token", () => {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      userId: 1,
      tenantId: 1,
      exp: Math.floor(Date.now() / 1000) + 60,
    })}.`;

    expect(readBearerAuth(`Bearer ${token}`)).toMatchObject({ kind: "error" });
  });
});
