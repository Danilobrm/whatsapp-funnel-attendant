import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test/render.tsx';
import PublicItemCard, { PublicItemCardSkeleton } from './PublicItemCard.tsx';
import { MENU } from './fixtures.test-util.ts';

const PIZZA = MENU[0]!.items[0]!;
const BURGER = MENU[1]!.items[0]!;
const SUCO = MENU[2]!.items[1]!;

describe('PublicItemCard', () => {
  it('shows name, description and "a partir de" for an item with several sizes', () => {
    renderWithProviders(<PublicItemCard item={PIZZA} onOpen={vi.fn()} />);

    expect(screen.getByText('Pizza')).toBeInTheDocument();
    expect(screen.getByText('Pizza tradicional')).toBeInTheDocument();
    expect(screen.getByText('a partir de R$ 45,00')).toBeInTheDocument();
  });

  it('shows the plain price for an item without sizes, and for a single size', () => {
    const { rerender } = renderWithProviders(
      <PublicItemCard item={BURGER} onOpen={vi.fn()} />,
    );
    expect(screen.getByText('R$ 18,00')).toBeInTheDocument();

    rerender(
      <PublicItemCard
        item={{ ...PIZZA, sizes: [{ id: 1, name: 'Única', priceCents: 3000 }] }}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
  });

  it('opens on click', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<PublicItemCard item={BURGER} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: /X-Burger/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // Esgotado aparece (o cliente vê que existe), marcado em texto, e não abre.
  it('a sold-out item is labelled in text and cannot be opened', async () => {
    const onOpen = vi.fn();
    renderWithProviders(<PublicItemCard item={SUCO} onOpen={onOpen} />);

    expect(screen.getByText('Esgotado')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Suco de Laranja/ });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the skeleton has the same shape as the card', () => {
    renderWithProviders(<PublicItemCardSkeleton />);

    expect(screen.getByTestId('public-item-skeleton')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});
