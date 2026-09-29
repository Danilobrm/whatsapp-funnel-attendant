import { reverseGeocodeGoogle } from "../../geo/clients/google.client.js";
import { getStoreSettings, updateStoreSettings } from "./store.service.js";

import type { TenantId } from "../../tenants/types/tenant.types.js";

const MAX_ADDRESS = 300;

/**
 * Grava a localização da loja a partir de um ponto (mensagem de localização do
 * dono no WhatsApp). O endereço é SEMPRE o texto que o Google devolve para o
 * ponto — nunca digitado. Se o Google não responde, o ponto é salvo e o
 * endereço antigo é limpo (um endereço velho ao lado de um ponto novo mentiria).
 */
export async function setStoreLocation(
  tenantId: TenantId,
  latitude: number,
  longitude: number,
): Promise<{ address: string | null }> {
  let address: string | null = null;
  try {
    const found = await reverseGeocodeGoogle(latitude, longitude);
    address = found ? found.label.slice(0, MAX_ADDRESS) : null;
  } catch (err) {
    console.error(
      "[store] geocodificação reversa falhou:",
      err instanceof Error ? err.message : String(err),
    );
  }

  const current = await getStoreSettings(tenantId);
  await updateStoreSettings(tenantId, {
    ...current,
    latitude,
    longitude,
    address,
  });
  return { address };
}
