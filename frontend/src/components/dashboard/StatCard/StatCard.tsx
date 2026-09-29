import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  /** Linha de apoio abaixo do número (texto ou link). */
  hint?: ReactNode;
  /** `true` → sem dado ainda: skeleton no lugar do número. */
  loading?: boolean;
}

/** Número de destaque com rótulo. O rótulo fica visível mesmo carregando. */
export default function StatCard({
  label,
  value,
  hint,
  loading = false,
}: StatCardProps) {
  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-[13px] text-fg-muted">{label}</h2>
      {loading ? (
        <>
          <div
            aria-busy="true"
            data-testid="stat-skeleton"
            className="mt-1 h-8 w-24 animate-pulse rounded bg-skeleton"
          />
          <div className="mt-1 h-3 w-28 animate-pulse rounded bg-skeleton" />
        </>
      ) : (
        <>
          <p className="text-3xl font-semibold tracking-tight text-fg">
            {value}
          </p>
          {hint && <div className="text-[13px] text-fg-subtle">{hint}</div>}
        </>
      )}
    </section>
  );
}
