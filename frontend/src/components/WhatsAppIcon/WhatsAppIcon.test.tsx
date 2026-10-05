import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import WhatsAppIcon from './WhatsAppIcon.tsx';

describe('WhatsAppIcon', () => {
  it('renders the logo with currentColor and forwards props', () => {
    const { getByRole } = render(
      <WhatsAppIcon
        aria-label="WhatsApp"
        className="h-5 w-5"
        strokeWidth={1.75}
      />,
    );
    const svg = getByRole('img', { name: 'WhatsApp' });
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveClass('h-5', 'w-5');
    expect(svg).not.toHaveAttribute('stroke-width');
  });
});
