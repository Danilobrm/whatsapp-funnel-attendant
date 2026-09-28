import { env } from "../../config/env.js";
import { fetchWithTimeout } from "../../lib/fetchWithTimeout.js";

/** Resposta não-2xx da Graph API. O corpo vai para o log, nunca para cliente. */
export class WhatsAppSendError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`Graph API respondeu ${status}: ${detail}`);
    this.name = "WhatsAppSendError";
    this.status = status;
  }
}

export type SendResult =
  { sent: true } | { sent: false; reason: "not_configured" };

/**
 * Envia uma mensagem de texto pela WhatsApp Cloud API.
 *
 * Sem `WHATSAPP_ACCESS_TOKEN` o envio é pulado (e logado) em vez de lançar:
 * em dev só o simulador é usado, e a ausência do token é configuração, não
 * falha de uma conversa específica.
 *
 * Mensagem de texto livre só é aceita dentro da janela de 24h aberta pela
 * última mensagem do cliente — que é sempre o caso de uma resposta. Fora dela
 * a Meta exige template aprovado (não implementado aqui).
 */
export async function sendWhatsAppText(
  phoneNumberId: string,
  to: string,
  body: string,
): Promise<SendResult> {
  const { accessToken, graphApiVersion, timeoutMs } = env.whatsapp;

  if (!accessToken) {
    console.warn(
      `[whatsapp] WHATSAPP_ACCESS_TOKEN ausente — resposta para ${to} não enviada.`,
    );
    return { sent: false, reason: "not_configured" };
  }

  const url = `https://graph.facebook.com/${graphApiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
  const response = await fetchWithTimeout(timeoutMs)(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new WhatsAppSendError(response.status, detail.slice(0, 500));
  }

  return { sent: true };
}
