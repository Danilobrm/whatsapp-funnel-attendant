import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SettingsRejectedError,
  fetchBotSettings,
  saveBotSettings,
} from './settings.ts';

const fetchMock = vi.fn();

const settings = {
  name: 'Nina',
  personality: 'friendly' as const,
  gender: 'female' as const,
  languages: ['pt-BR'],
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('fetchBotSettings', () => {
  it('returns settings, options and preview', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        settings,
        options: {
          personalities: ['friendly'],
          genders: ['neutral'],
          languages: ['pt-BR'],
        },
        preview: { greeting: 'Oi!', fallback: 'x', junk: 'y' },
      }),
    });

    const data = await fetchBotSettings();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3000/api/settings',
    );
    expect(data.settings.name).toBe('Nina');
    expect(data.options.languages).toEqual(['pt-BR']);
    expect(data.preview.greeting).toBe('Oi!');
  });

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchBotSettings()).rejects.toThrow('HTTP 500');
  });
});

describe('saveBotSettings', () => {
  it('PUTs the settings payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        settings,
        preview: { greeting: 'Oi!', fallback: 'x', junk: 'y' },
      }),
    });

    const result = await saveBotSettings(settings);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    );
    expect(result.settings.name).toBe('Nina');
  });

  it('maps 422 to SettingsRejectedError with code/field', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ code: 'name_required', field: 'name' }),
    });

    await expect(
      saveBotSettings({ ...settings, name: '' }),
    ).rejects.toMatchObject({
      name: 'SettingsRejectedError',
      code: 'name_required',
      field: 'name',
    });
  });

  it('falls back to defaults when the 422 body is unreadable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => {
        throw new Error('bad json');
      },
    });

    await expect(saveBotSettings(settings)).rejects.toBeInstanceOf(
      SettingsRejectedError,
    );
  });

  it('throws on other non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(saveBotSettings(settings)).rejects.toThrow('HTTP 503');
  });
});
