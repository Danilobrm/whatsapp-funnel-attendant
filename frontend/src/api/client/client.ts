import { getAuthToken } from '../authToken/authToken.ts';

/**
 * O fallback é o que mantém verdes as asserções de URL nos testes existentes:
 * `VITE_API_BASE_URL` não é definida no Vitest.
 */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * A mensagem é `HTTP <status>` e vários testes afirmam
 * `rejects.toThrow('HTTP 500')`. NUNCA renderize `err.message` na UI — a UI
 * mostra texto de i18n por `code`.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class UnauthorizedError extends ApiError {
  readonly code: string;

  constructor(code: string) {
    super(401);
    this.name = 'UnauthorizedError';
    this.code = code;
  }
}

type StatusMapper = (payload: unknown) => Error;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Anexa `Authorization: Bearer` quando houver token. Default: true. */
  auth?: boolean;
  /**
   * Status → erro tipado. É como o 422 de settings e do simulador sobrevivem
   * ao cliente compartilhado — e, se você mapear 401 aqui, opta por sair do
   * logout global (é o que impede o login recusado de virar loop).
   */
  onStatus?: Record<number, StatusMapper>;
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * Registrado pelo `AuthProvider`. É um setter de módulo, e não um import de
 * React, porque `client.ts` precisa ser importável de módulos puros e de
 * testes sem árvore de componentes.
 */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

/**
 * Dispara o logout global de fora do `request()` — usado pelo stream de
 * pedidos, que faz `fetch` direto (precisa ler o corpo aos pedaços).
 */
export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, signal, auth = true, onStatus } = options;

  const isFormData = body instanceof FormData;

  const headers: Record<string, string> = {};
  // Content-Type só quando há corpo — preserva o formato de requisição atual,
  // que os testes de api/* afirmam byte a byte. FormData é a exceção: o
  // browser precisa escrever o boundary do multipart sozinho, então NÃO
  // setamos o header (setar manualmente quebra o parse no servidor).
  if (body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : { body: isFormData ? body : JSON.stringify(body) }),
  });

  // onStatus ANTES de `response.ok`: o mapper recebe o corpo já
  // desserializado (ex.: o `code` de um 422).
  const mapper = onStatus?.[response.status];
  if (mapper) {
    throw mapper(await readJson(response));
  }

  if (response.status === 401) {
    const payload = (await readJson(response)) as { code?: string } | null;
    unauthorizedHandler?.();
    throw new UnauthorizedError(payload?.code ?? 'unauthorized');
  }

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  // 204 não tem corpo — `response.json()` lançaria.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
