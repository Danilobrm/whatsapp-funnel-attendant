import { beforeEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';

import ThemeToggle from './ThemeToggle.tsx';
import { renderWithProviders } from '../../test/render.tsx';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('renders a button with an aria-label', () => {
    renderWithProviders(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-label');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('flips data-theme and aria-pressed on click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await user.click(screen.getByRole('button'));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
