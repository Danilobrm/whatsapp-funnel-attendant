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

  it('renderiza a imagem real quando há src absoluto', () => {
    render(<ItemImage src="https://example.com/pizza.jpg" alt="Calabresa" />);
    const img = screen.getByRole('img', { name: 'Calabresa' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://example.com/pizza.jpg');
  });

  it('resolve src relativo (/produtos/...) contra a API — front e back têm portas diferentes em dev', () => {
    render(<ItemImage src="/produtos/abc.png" alt="Calabresa" />);
    expect(screen.getByRole('img', { name: 'Calabresa' })).toHaveAttribute(
      'src',
      'http://localhost:3000/produtos/abc.png',
    );
  });

  it('cai no placeholder se a imagem falhar ao carregar', () => {
    render(
      <ItemImage src="https://example.com/quebrado.jpg" alt="Calabresa" />,
    );
    const img = screen.getByRole('img', { name: 'Calabresa' });

    fireEvent.error(img);

    // Depois do erro, o elemento vira o placeholder (uma div, não mais um <img>).
    const placeholder = screen.getByRole('img', { name: 'Calabresa' });
    expect(placeholder.tagName).not.toBe('IMG');
  });

  it('size="full" ocupa a largura toda e fica quadrada (imagem e placeholder)', () => {
    const { unmount } = render(
      <ItemImage
        src="https://example.com/pizza.jpg"
        alt="Calabresa"
        size="full"
      />,
    );
    expect(screen.getByRole('img', { name: 'Calabresa' })).toHaveClass(
      'w-full',
      'aspect-square',
    );
    unmount();

    render(<ItemImage src={null} alt="Calabresa" size="full" />);
    expect(screen.getByRole('img', { name: 'Calabresa' })).toHaveClass(
      'w-full',
      'aspect-square',
    );
  });

  it('size="cover" ocupa a largura toda em 4:3 (imagem e placeholder)', () => {
    const { unmount } = render(
      <ItemImage
        src="https://example.com/pizza.jpg"
        alt="Calabresa"
        size="cover"
      />,
    );
    expect(screen.getByRole('img', { name: 'Calabresa' })).toHaveClass(
      'w-full',
      'aspect-[4/3]',
    );
    unmount();

    render(<ItemImage src={null} alt="Calabresa" size="cover" />);
    expect(screen.getByRole('img', { name: 'Calabresa' })).toHaveClass(
      'w-full',
      'aspect-[4/3]',
    );
  });
});
