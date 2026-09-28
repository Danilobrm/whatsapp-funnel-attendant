/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base da API. Vite embute em BUILD time — mudar depois de `vite build` não
   * tem efeito. Ausente = `http://localhost:3000` (dev e testes).
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
