import { useEffect, useState } from 'react';
import { MapPin, Search } from 'lucide-react';

import { searchCities, type CityOption } from '../../../api/store/store.ts';
import { useT } from '../../../i18n/index.tsx';

const SEARCH_DEBOUNCE_MS = 400;
const MIN_QUERY_CHARS = 2;

interface CityPickerProps {
  onPick: (city: CityOption) => void;
  disabled?: boolean;
}

/** Busca de cidade (Nominatim via backend), com debounce. */
export default function CityPicker({ onPick, disabled }: CityPickerProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchCities(q)
        .then((res) => {
          if (cancelled) return;
          setResults(res.cities);
          setFailed(false);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const showEmpty =
    !searching &&
    !failed &&
    query.trim().length >= MIN_QUERY_CHARS &&
    results.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-fg-subtle focus-within:border-accent">
        <Search
          className="h-4 w-4 flex-none"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('delivery.city.searchPlaceholder')}
          aria-label={t('delivery.city.search')}
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
      </label>

      {searching && (
        <div aria-busy="true" className="flex flex-col gap-1">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-10 w-full animate-pulse rounded-xl bg-skeleton"
            />
          ))}
        </div>
      )}
      {failed && (
        <p className="text-[13px] text-danger">
          {t('delivery.errors.geo_unavailable')}
        </p>
      )}
      {showEmpty && (
        <p className="text-[13px] text-fg-muted">
          {t('delivery.city.noResults')}
        </p>
      )}

      {!searching && results.length > 0 && (
        <ul className="flex flex-col overflow-hidden rounded-xl border border-line">
          {results.map((city) => (
            <li
              key={city.osmId}
              className="border-b border-line last:border-b-0"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(city)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg transition hover:bg-hover disabled:opacity-60"
              >
                <MapPin
                  className="h-4 w-4 flex-none text-fg-subtle"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="font-medium">{city.name}</span>
                {city.state && (
                  <span className="text-fg-muted">{city.state}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
