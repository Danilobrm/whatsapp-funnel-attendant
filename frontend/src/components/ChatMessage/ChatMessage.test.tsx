import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';

import ChatMessage from './ChatMessage.tsx';

describe('ChatMessage', () => {
  it('renders the user message as an outgoing (right) bubble', () => {
    renderWithProviders(<ChatMessage role="user" content="oi, tudo bem?" />);

    const bubble = screen.getByText('oi, tudo bem?').closest('[data-role]');
    expect(bubble).toHaveAttribute('data-role', 'user');
    expect(bubble?.parentElement).toHaveClass('justify-end');
    expect(bubble).toHaveClass('bg-accent');
  });

  it('renders assistant reply text', () => {
    renderWithProviders(
      <ChatMessage role="assistant" content="Resposta aprovada." />,
    );

    const bubble = screen
      .getByText('Resposta aprovada.')
      .closest('[data-role]');
    expect(bubble).toHaveAttribute('data-role', 'assistant');
    expect(bubble?.parentElement).toHaveClass('justify-start');
  });

  it('renders assistant error text', () => {
    renderWithProviders(
      <ChatMessage role="assistant" content="Falha ao consultar." error />,
    );

    expect(
      screen.getByText('Falha ao consultar.').closest('[data-role]'),
    ).toHaveClass('text-danger');
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

  it('renders the typing indicator as an incoming bubble, label for screen readers', () => {
    renderWithProviders(
      <ChatMessage role="assistant" content="Digitando..." pending />,
    );

    const label = screen.getByText('Digitando');
    expect(label).toHaveClass('sr-only');
    expect(label.closest('[data-role]')).toHaveAttribute(
      'data-role',
      'assistant',
    );
  });

  it('turns a URL in the text into a link that opens in a new tab, safely', () => {
    renderWithProviders(
      <ChatMessage
        role="assistant"
        content={
          'Abra o cardápio:\nhttps://loja.app/c/abc.def.ghi\nE volte aqui.'
        }
      />,
    );

    const link = screen.getByRole('link', {
      name: 'https://loja.app/c/abc.def.ghi',
    });
    expect(link).toHaveAttribute('href', 'https://loja.app/c/abc.def.ghi');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/Abra o cardápio:/)).toBeInTheDocument();
    expect(screen.getByText(/E volte aqui\./)).toBeInTheDocument();
  });

  it('does not turn dangerous schemes or plain text into links', () => {
    renderWithProviders(
      <ChatMessage
        role="assistant"
        content="javascript:alert(1) e www.x.app"
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
