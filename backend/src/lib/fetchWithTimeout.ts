/**
 * `fetch` com prazo. TODA chamada de rede que fica no caminho de uma resposta
 * ao cliente passa por aqui (Ollama, Graph API da Meta). Sem AbortController,
 * um serviço que trava deixa a conversa pendurada para sempre e os sockets se
 * acumulam até a API parar de aceitar conexão.
 */
export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}
