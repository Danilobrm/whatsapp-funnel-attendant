import { useEffect, useRef, useState } from 'react';

import { useT } from '../../../i18n/index.tsx';
import {
  loadGoogleMaps,
  MapsUnavailableError,
  type GoogleMaps,
} from '../../../lib/googleMaps.ts';
import MapStatus, { type MapLoadState } from '../MapStatus.tsx';
import { MAP_ID } from '../cityBoundary.ts';
import {
  mapStylesFor,
  observeTheme,
  readMapTheme,
  themeMapOptions,
} from '../mapTheme.ts';
import {
  initialView,
  roundLatLng,
  type Bounds,
  type LatLng,
} from './locationView.ts';

/** Gota com a ponta na origem (0,0): dispensa `anchor` e o pino cai no ponto exato. */
const PIN_PATH =
  'M0 0C-3 -8 -11 -12 -11 -21A11 11 0 1 1 11 -21C11 -12 3 -8 0 0Z';

function pinIcon(): google.maps.Symbol {
  const theme = readMapTheme();
  return {
    path: PIN_PATH,
    fillColor: theme.danger,
    fillOpacity: 1,
    strokeColor: theme.background,
    strokeWeight: 3,
    scale: 1,
  } as google.maps.Symbol;
}

interface LocationMapProps {
  position: LatLng | null;
  onChange: (position: LatLng) => void;
  /** Enquadramento quando não há pino — a cidade da aba Entrega. */
  cityBounds: Bounds | null;
  disabled?: boolean;
}

export function LocationMapSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="location-map-skeleton"
      className="h-[360px] w-full animate-pulse rounded-xl bg-skeleton"
    />
  );
}

const toLiteral = ([[south, west], [north, east]]: Bounds) => ({
  south,
  west,
  north,
  east,
});

/**
 * Pino do restaurante: clique no mapa marca/move, arrastar ajusta. Google Maps
 * imperativo; o React só controla `position`.
 */
export default function LocationMap({
  position,
  onChange,
  cityBounds,
  disabled = false,
}: LocationMapProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<GoogleMaps | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [state, setState] = useState<MapLoadState>('loading');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  // Monta uma vez; o enquadramento inicial usa o que houver no primeiro render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let stopTheme = () => {};

    loadGoogleMaps().then(
      (maps) => {
        if (cancelled) return;
        mapsRef.current = maps;
        const map = new maps.Map(container, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          ...themeMapOptions(readMapTheme(), MAP_ID),
        });
        mapRef.current = map;

        const view = initialView(position, cityBounds);
        if (view.kind === 'point') {
          map.setCenter({ lat: view.center[0], lng: view.center[1] });
          map.setZoom(view.zoom);
        } else {
          map.fitBounds(toLiteral(view.bounds), 16);
        }

        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (disabledRef.current || !event.latLng) return;
          onChangeRef.current(
            roundLatLng({ lat: event.latLng.lat(), lng: event.latLng.lng() }),
          );
        });

        stopTheme = observeTheme(() => {
          const theme = readMapTheme();
          map.setOptions(
            MAP_ID
              ? themeMapOptions(theme, MAP_ID)
              : { styles: mapStylesFor(theme) },
          );
          markerRef.current?.setIcon(pinIcon());
        });
        setState('ready');
      },
      (error: unknown) => {
        if (cancelled) return;
        setState(
          error instanceof MapsUnavailableError
            ? error
            : new MapsUnavailableError('load_failed'),
        );
      },
    );

    return () => {
      cancelled = true;
      stopTheme();
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      mapsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pino segue `position` (clique, arraste, geocodificação, remoção).
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (state !== 'ready' || !maps || !map) return;

    if (!position) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setPosition(position);
    } else {
      const marker = new maps.Marker({
        map,
        position,
        icon: pinIcon(),
        draggable: !disabledRef.current,
        title: t('store.location.pin'),
      });
      marker.addListener('dragend', () => {
        const p = marker.getPosition();
        if (p) onChangeRef.current(roundLatLng({ lat: p.lat(), lng: p.lng() }));
      });
      markerRef.current = marker;
    }
    if (!map.getBounds()?.contains(position)) {
      map.setCenter(position);
      map.setZoom(Math.max(map.getZoom() ?? 0, 15));
    }
  }, [state, position, t]);

  // Somente leitura: o pino não se arrasta.
  useEffect(() => {
    markerRef.current?.setDraggable(!disabled);
  }, [disabled, state, position]);

  return (
    <div
      role="region"
      aria-label={t('store.location.mapLabel')}
      className="relative h-[360px] w-full overflow-hidden rounded-xl border border-line"
    >
      <div ref={containerRef} className="h-full w-full" />
      <MapStatus state={state} />
    </div>
  );
}
