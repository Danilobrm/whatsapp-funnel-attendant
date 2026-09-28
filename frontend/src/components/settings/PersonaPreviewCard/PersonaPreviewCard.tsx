import type { PersonaPreview } from '../../../api/settings';

interface PersonaPreviewCardProps {
  preview: PersonaPreview;
  labels: {
    greeting: string;
    identity: string;
    fallback: string;
    junk: string;
  };
}

export function PersonaPreviewCardSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      data-testid="persona-preview-skeleton"
    >
      {/* 4 = uma linha por texto da persona. */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-line p-4">
          <div className="h-3 w-24 animate-pulse rounded bg-skeleton" />
          <div className="mt-2 h-4 w-full animate-pulse rounded bg-skeleton" />
          <div className="mt-1.5 h-4 w-3/4 animate-pulse rounded bg-skeleton" />
        </div>
      ))}
    </div>
  );
}

/**
 * Como o bot fala com a persona salva. Os textos vêm do backend — a mesma
 * fonte que a conversa usa — para a prévia não divergir do WhatsApp.
 */
export default function PersonaPreviewCard({
  preview,
  labels,
}: PersonaPreviewCardProps) {
  // Só os textos fixos da persona. Resposta da IA não aparece aqui porque
  // varia a cada conversa — para ela, use o simulador.
  const rows: { key: keyof PersonaPreview; label: string }[] = [
    { key: 'greeting', label: labels.greeting },
    { key: 'identity', label: labels.identity },
    { key: 'fallback', label: labels.fallback },
    { key: 'junk', label: labels.junk },
  ];

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-line p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
            {row.label}
          </p>
          <p className="mt-1.5 text-sm text-fg">{preview[row.key]}</p>
        </div>
      ))}
    </div>
  );
}
