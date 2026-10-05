/**
 * Interruptores de funcionalidade. O código de mapa (Google Maps, pino do
 * restaurante, aba Entrega) fica no repositório, só desligado: religar é
 * trocar `maps` para `true` (e configurar as chaves — ver `.env.example`).
 */
export const features = {
  /** Mapas da aba Entrega (cidade e bairros). */
  maps: false,
  /** Endereço da loja pela localização atual + mapa do pino (aba Geral). */
  storeLocation: true,
};
