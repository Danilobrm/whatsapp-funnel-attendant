import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { render, screen } from '../../../test/render.tsx';
import ItemImage from './ItemImage.tsx';

describe('ItemImage', () => {
  it('mostra o placeholder quando não há src', () => {
    render(<ItemImage src={null} alt="Calabresa" />);
    expect(screen.getByRole('img', { name: 'Calabresa' })).toBeInTheDocument();
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('renderiza a imagem real quando há src', () => {
    render(<ItemImage src="https://example.com/pizza.jpg" alt="Calabresa" />);
    const img = screen.getByRole('img', { name: 'Calabresa' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.com/pizza.jpg');
  });

  it('cai no placeholder se a imagem falhar ao carregar', () => {
    render(<ItemImage src="https://example.com/quebrado.jpg" alt="Calabresa" />);
    const img = screen.getByRole('img', { name: 'Calabresa' });

    fireEvent.error(img);

    // Depois do erro, o elemento vira o placeholder (uma div, não mais um <img>).
    const placeholder = screen.getByRole('img', { name: 'Calabresa' });
    expect(placeholder.tagName).not.toBe('IMG');
  });
});
