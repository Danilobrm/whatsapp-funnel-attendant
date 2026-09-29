export interface RankedRow {
  key: string;
  label: string;
  /** Texto à direita (quantidade, %, valor) — sempre em tinta de texto. */
  value: string;
  /** 0–100: comprimento da barrinha. */
  share: number;
}

interface RankedListProps {
  rows: RankedRow[];
  emptyText: string;
  loading?: boolean;
}

export function RankedListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul
      aria-busy="true"
      data-testid="ranked-skeleton"
      className="flex flex-col gap-3"
    >
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-skeleton" />
            <div className="h-4 w-12 animate-pulse rounded bg-skeleton" />
          </div>
          <div className="h-1.5 w-full animate-pulse rounded-full bg-skeleton" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Lista ordenada com barra proporcional — no lugar de pizza: comprimento lado
 * a lado se compara melhor que ângulo. Uma cor só (a barra é magnitude, não
 * identidade); rótulo e valor em tinta de texto.
 */
export default function RankedList({
  rows,
  emptyText,
  loading = false,
}: RankedListProps) {
  if (loading) return <RankedListSkeleton />;
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-[13px] text-fg-subtle">{emptyText}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-fg">{row.label}</span>
            <span className="flex-none text-fg-muted">{row.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover">
            <div
              data-testid="ranked-bar"
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(Math.max(row.share, 0), 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
