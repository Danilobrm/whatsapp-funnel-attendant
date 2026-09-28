import { afterEach, describe, expect, it, vi } from "vitest";

async function loadClient(accessToken: string) {
  vi.resetModules();
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", accessToken);
  vi.stubEnv("WHATSAPP_GRAPH_API_VERSION", "v23.0");
  return import("./whatsapp.client.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendWhatsAppText", () => {
  it("posts a text message to the Graph API with the bearer token", async () => {
    const { sendWhatsAppText } = await loadClient("TOKEN");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await expect(
      sendWhatsAppText("1234567890", "5511988887777", "Olá!"),
    ).resolves.toEqual({ sent: true });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/1234567890/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer TOKEN",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "5511988887777",
      type: "text",
      text: { body: "Olá!" },
    });
  });

  it("skips sending when the token is not configured", async () => {
    const { sendWhatsAppText } = await loadClient("");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sendWhatsAppText("1", "2", "x")).resolves.toEqual({
      sent: false,
      reason: "not_configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws a typed error on a non-2xx response", async () => {
    const { sendWhatsAppText, WhatsAppSendError } = await loadClient("TOKEN");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":{"code":131047}}', { status: 400 }),
    );

    await expect(sendWhatsAppText("1", "2", "x")).rejects.toBeInstanceOf(
      WhatsAppSendError,
    );
  });
});
