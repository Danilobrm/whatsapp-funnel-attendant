import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MenuRejectedError, uploadItemImage } from './menu.ts';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function init() {
  return fetchMock.mock.calls[0]?.[1] as RequestInit & {
    headers: Record<string, string>;
    body: FormData;
  };
}

describe('uploadItemImage', () => {
  it('envia o arquivo como multipart no campo "image"', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ url: '/produtos/abc.png' }),
    });
    const file = new File(['fake'], 'calabresa.png', { type: 'image/png' });

    const result = await uploadItemImage(file);

    expect(result).toEqual({ url: '/produtos/abc.png' });
    expect(init().body).toBeInstanceOf(FormData);
    expect(init().body.get('image')).toBe(file);
    // Nunca JSON — o browser precisa escrever o boundary do multipart sozinho.
    expect(init().headers['Content-Type']).toBeUndefined();
  });

  it('rejeita com MenuRejectedError quando o backend recusa (tipo/tamanho)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ code: 'image_invalid_type', field: 'image' }),
    });
    const file = new File(['fake'], 'arquivo.txt', { type: 'text/plain' });

    const error = await uploadItemImage(file).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MenuRejectedError);
    expect((error as MenuRejectedError).code).toBe('image_invalid_type');
  });
});
