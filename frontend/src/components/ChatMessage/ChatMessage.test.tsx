import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';

import ChatMessage from './ChatMessage.tsx';

describe('ChatMessage', () => {
  it('renders user message as bubble', () => {
    renderWithProviders(<ChatMessage role="user" content="oi, tudo bem?" />);

    expect(screen.getByText('oi, tudo bem?')).toBeInTheDocument();
  });

  it('renders assistant reply text', () => {
    renderWithProviders(
      <ChatMessage role="assistant" content="Resposta aprovada." />,
    );

    expect(screen.getByText('Resposta aprovada.')).toBeInTheDocument();
  });

  it('renders assistant error text', () => {
    renderWithProviders(
      <ChatMessage role="assistant" content="Falha ao consultar." error />,
    );

    expect(screen.getByText('Falha ao consultar.')).toBeInTheDocument();
  });

  it('renders the note under an assistant reply', () => {
    renderWithProviders(
      <ChatMessage
        role="assistant"
        content="Qual sabor?"
        note="Gerado pela IA"
      />,
    );

    expect(screen.getByText('Gerado pela IA')).toBeInTheDocument();
  });
});
