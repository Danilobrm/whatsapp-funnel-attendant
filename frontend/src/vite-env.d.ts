/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base da API. Vite embute em BUILD time — mudar depois de `vite build` não
   * tem efeito. Ausente = `http://localhost:3000` (dev e testes).
   */
  readonly VITE_API_BASE_URL?: string;
  /**
   * Chave de NAVEGADOR do Google Maps (Maps JavaScript API, restrita por
   * referrer). Também embutida em BUILD time. Ausente = os mapas mostram um
   * aviso em vez de carregar.
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  /**
   * Map ID vetorial (Google Cloud → Map Management) com a camada de limites
   * "Locality" ativada. Opcional: com ele o contorno da cidade é o do Google;
   * sem ele, o município do OpenStreetMap.
   */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
