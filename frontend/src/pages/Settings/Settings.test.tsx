import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, waitFor } from '../../test/render.tsx';

vi.mock('../../api/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/settings')>();
  return {
    ...actual,
    fetchBotSettings: vi.fn(),
    saveBotSettings: vi.fn(),
  };
});

import {
  SettingsRejectedError,
  fetchBotSettings,
  saveBotSettings,
} from '../../api/settings';

import Settings from './Settings.tsx';

const fetchMock = vi.mocked(fetchBotSettings);
const saveMock = vi.mocked(saveBotSettings);

// O autosave espera 700ms parado antes de salvar — waitFor precisa de mais
// margem que o default (1000ms) pra não flakear perto do limite.
const AUTOSAVE_WAIT = { timeout: 2500 };

const settings = {
  name: 'Nina',
  personality: 'friendly' as const,
  gender: 'female' as const,
  languages: ['pt-BR'],
};

const response = {
  settings,
  options: {
    personalities: ['friendly', 'formal', 'objective', 'technical'] as const,
    genders: ['neutral', 'female', 'male'] as const,
    languages: ['pt-BR'],
  },
  preview: {
    greeting: 'Oi! Eu sou Nina, a atendente virtual.',
    identity: 'Eu sou Nina, a atendente virtual.',
    fallback: 'Ainda não tenho essa resposta na base.',
    junk: 'Não consegui entender.',
  },
};

function renderPage() {
  return renderWithProviders(<Settings />);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(structuredClone(response) as never);
});

describe('Settings — layout', () => {
  // jsdom não faz layout, então a regressão das "duas barras de rolagem" é
  // verificada pela contagem de containers roláveis: só o wrapper da página
  // pode rolar — o AdminLayout já corta o overflow acima dele.
  it('exposes a single scroll container', async () => {
    const { container } = renderPage();
    await screen.findByDisplayValue('Nina');

    expect(container.querySelectorAll('.overflow-y-auto')).toHaveLength(1);
  });

  it('spreads the sections over multiple columns, admin page standard', async () => {
    const { container } = renderPage();
    await screen.findByDisplayValue('Nina');

    expect(container.querySelector('.xl\\:grid-cols-3')).not.toBeNull();
  });

  it('follows the admin page width — no max-w cap on the page container', async () => {
    const { container } = renderPage();
    await screen.findByDisplayValue('Nina');

    const main = container.querySelector('main');
    expect(main?.className).not.toMatch(/max-w-/);
  });
});

describe('Settings — loading', () => {
  it('keeps the section titles visible and skeletons the loading widgets', () => {
    fetchMock.mockReturnValue(new Promise(() => {}) as never);
    renderPage();

    expect(screen.getByText('Personalidade')).toBeInTheDocument();
    expect(screen.getByText('Idiomas')).toBeInTheDocument();
    expect(screen.getByTestId('bot-name-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('language-list-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('persona-preview-skeleton')).toBeInTheDocument();
  });

  it('shows an error when the config cannot be loaded', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 500'));
    renderPage();

    expect(
      await screen.findByText(
        'Não foi possível carregar a configuração do atendente.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Settings — configuring the bot', () => {
  it('renders persona, gender and the Brazilian flag for pt-BR', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Nina')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Amigável/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Feminino/ })).toBeChecked();
    expect(
      screen.getByRole('img', { name: 'Português (Brasil)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Oi! Eu sou Nina, a atendente virtual.'),
    ).toBeInTheDocument();
  });

  it('locks pt-BR on, since it is the only language available', async () => {
    renderPage();

    expect(
      await screen.findByRole('checkbox', { name: 'Português (Brasil)' }),
    ).toBeDisabled();
  });

  it('shows no sync status until something changes, then saves on its own', async () => {
    saveMock.mockResolvedValue({
      settings: { ...settings, personality: 'technical' },
      preview: response.preview,
    });

    renderPage();
    await screen.findByDisplayValue('Nina');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /Técnico/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Alterações não salvas...',
    );

    await waitFor(
      () =>
        expect(saveMock).toHaveBeenCalledWith({
          name: 'Nina',
          personality: 'technical',
          gender: 'female',
          languages: ['pt-BR'],
        }),
      AUTOSAVE_WAIT,
    );

    expect(await screen.findByRole('status')).toHaveTextContent('Salvo');
  });

  it('saves the edited persona and refreshes the preview, with no button to click', async () => {
    const updated = {
      ...settings,
      personality: 'objective' as const,
      gender: 'male' as const,
      name: 'Zé',
    };
    saveMock.mockResolvedValue({
      settings: updated,
      preview: {
        greeting: 'Sou Zé, o atendente virtual. Qual o seu pedido?',
        identity: 'Zé, o atendente virtual.',
        fallback: 'Sem resposta cadastrada.',
        junk: 'Não entendi.',
      },
    });

    renderPage();
    expect(
      screen.queryByRole('button', { name: /sincronizar/i }),
    ).not.toBeInTheDocument();

    const nameInput = await screen.findByDisplayValue('Nina');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Zé');
    await userEvent.click(screen.getByRole('radio', { name: /Objetivo/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Masculino/ }));

    await waitFor(
      () =>
        expect(saveMock).toHaveBeenCalledWith({
          name: 'Zé',
          personality: 'objective',
          gender: 'male',
          languages: ['pt-BR'],
        }),
      AUTOSAVE_WAIT,
    );

    expect(
      await screen.findByText(
        'Sou Zé, o atendente virtual. Qual o seu pedido?',
      ),
    ).toBeInTheDocument();
  });

  it('renders the rejection code as a translated message', async () => {
    saveMock.mockRejectedValue(
      new SettingsRejectedError('name_too_long', 'name'),
    );

    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: /Formal/ }));

    expect(
      await screen.findByText(
        'O nome do bot passa de 60 caracteres.',
        undefined,
        AUTOSAVE_WAIT,
      ),
    ).toBeInTheDocument();
  });

  it('falls back to the generic message for an unknown code', async () => {
    saveMock.mockRejectedValue(new Error('network down'));

    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: /Formal/ }));

    expect(
      await screen.findByText(
        'Não foi possível salvar. Tente novamente.',
        undefined,
        AUTOSAVE_WAIT,
      ),
    ).toBeInTheDocument();
  });
});
