import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../../test/render.tsx';

import OptionCardGroup, {
  OptionCardGroupSkeleton,
} from './OptionCardGroup.tsx';

const options = [
  { value: 'friendly', title: 'Amigável', description: 'Próximo e acolhedor.' },
  { value: 'formal', title: 'Formal', description: 'Cordial e impessoal.' },
];

describe('OptionCardGroup', () => {
  it('marks the selected option as checked', () => {
    renderWithProviders(
      <OptionCardGroup
        legend="Personalidade"
        name="p"
        value="formal"
        options={options}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: /Formal/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Amigável/ })).not.toBeChecked();
  });

  it('emits the clicked value', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <OptionCardGroup
        legend="Personalidade"
        name="p"
        value="formal"
        options={options}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: /Amigável/ }));

    expect(onChange).toHaveBeenCalledWith('friendly');
  });

  it('does not emit while disabled', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <OptionCardGroup
        legend="Personalidade"
        name="p"
        value="formal"
        options={options}
        onChange={onChange}
        disabled
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: /Amigável/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  // `fieldset` tem `min-width: min-content` por padrão: sem `min-w-0` ele
  // estoura o grid do pai e a página ganha uma barra de rolagem horizontal.
  it('lets the fieldset shrink inside its grid column', () => {
    const { container } = renderWithProviders(
      <OptionCardGroup
        legend="Personalidade"
        name="p"
        value="formal"
        options={options}
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector('fieldset')).toHaveClass('min-w-0');
  });

  it('renders one skeleton card per expected option', () => {
    renderWithProviders(<OptionCardGroupSkeleton options={4} />);

    const skeleton = screen.getByTestId('option-card-group-skeleton');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton.children).toHaveLength(4);
  });

  // Classes precisam ser literais pro JIT do Tailwind gerar — cobre que o
  // mapa estático (`COLUMN_CLASSES`) tem uma entrada por valor aceito.
  it.each([
    [undefined, ['sm:grid-cols-2']],
    [2, ['sm:grid-cols-2']],
    [3, ['sm:grid-cols-2', 'lg:grid-cols-3']],
    [4, ['sm:grid-cols-2', 'lg:grid-cols-4']],
  ] as const)('columns=%s renders %j', (columns, expectedClasses) => {
    const { container } = renderWithProviders(
      <OptionCardGroup
        legend="Personalidade"
        name="p"
        value="formal"
        options={options}
        onChange={vi.fn()}
        columns={columns}
      />,
    );

    const grid = container.querySelector('fieldset > div');
    for (const cls of expectedClasses) {
      expect(grid).toHaveClass(cls);
    }
  });
});
