import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';

import LanguageList, { LanguageListSkeleton } from './LanguageList.tsx';

const ptBR = {
  code: 'pt-BR',
  label: 'Português (Brasil)',
  description: 'Idioma canônico da base.',
  enabled: true,
};

describe('LanguageList', () => {
  it('shows the Brazilian flag next to pt-BR', () => {
    renderWithProviders(
      <LanguageList items={[ptBR]} onToggle={vi.fn()} activeLabel="Ativo" />,
    );

    expect(
      screen.getByRole('img', { name: 'Português (Brasil)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Português (Brasil)')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('emits the toggled code', async () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <LanguageList
        items={[{ ...ptBR, enabled: false }]}
        onToggle={onToggle}
        activeLabel="Ativo"
      />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Português (Brasil)' }),
    );

    expect(onToggle).toHaveBeenCalledWith('pt-BR', true);
  });

  it('cannot turn off a locked language', async () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <LanguageList
        items={[{ ...ptBR, locked: true, lockedHint: 'Único idioma' }]}
        onToggle={onToggle}
        activeLabel="Ativo"
      />,
    );

    const toggle = screen.getByRole('checkbox', { name: 'Português (Brasil)' });
    expect(toggle).toBeDisabled();

    await userEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders a skeleton row while loading', () => {
    renderWithProviders(<LanguageListSkeleton rows={2} />);

    const skeleton = screen.getByTestId('language-list-skeleton');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton.children).toHaveLength(2);
  });
});
