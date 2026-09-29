import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  /** Rodapé fixo (ex.: botão de adicionar/confirmar). */
  footer?: ReactNode;
}

/**
 * Folha que sobe de baixo no celular (e vira caixa central no desktop). Mesmo
 * casco do carrinho e do item. `role=dialog` + `aria-modal`, Escape fecha, o
 * foco vai para o botão de fechar ao abrir e volta a quem abriu ao fechar.
 */
export default function Sheet({
  title,
  closeLabel,
  onClose,
  children,
  footer,
}: SheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      {/* Fundo: clique fora fecha. Não é foco de teclado (o Escape já cobre). */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-fg/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-canvas shadow-xl sm:max-w-lg sm:rounded-3xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="truncate text-[15px] font-medium text-fg">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-fg-muted transition hover:bg-hover"
          >
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <footer className="border-t border-line bg-canvas px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
