import { useEffect, useState } from 'react';

/** `Date.now()` que se atualiza a cada `intervalMs` — relógio para "há 5 min". */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}
