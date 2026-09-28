import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';

import PersonaPreviewCard from './PersonaPreviewCard.tsx';

const labels = {
  greeting: 'Saudação',
  identity: 'Quando perguntam quem ele é',
  fallback: 'Sem resposta na base',
  junk: 'Não entendi',
};

const preview = {
  greeting: 'Oi! Eu sou Nina.',
  identity: 'Eu sou Nina, a atendente virtual.',
  fallback: 'Ainda não tenho essa resposta na base.',
  junk: 'Não consegui entender.',
};

describe('PersonaPreviewCard', () => {
  it('shows how the bot introduces itself', () => {
    renderWithProviders(
      <PersonaPreviewCard preview={preview} labels={labels} />,
    );

    expect(screen.getByText(labels.identity)).toBeInTheDocument();
    expect(
      screen.getByText('Eu sou Nina, a atendente virtual.'),
    ).toBeInTheDocument();
  });

  // Regressão: existia uma linha "abertura antes da resposta" ("Claro! ") que
  // era prefixada a toda resposta aprovada. A prévia mostra só os textos
  // autorais do bot.
  it('shows only the four texts the bot writes on its own', () => {
    renderWithProviders(
      <PersonaPreviewCard preview={preview} labels={labels} />,
    );

    for (const label of Object.values(labels)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText(/Claro!/)).not.toBeInTheDocument();
  });
});
