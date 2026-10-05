import { useEffect, useRef, useState } from 'react';

import { formatBRL } from '../../../lib/money.ts';
import { useT } from '../../../i18n/index.tsx';
import {
  loadGoogleMaps,
  MapsUnavailableError,
  type GoogleMaps,
} from '../../../lib/googleMaps.ts';
import MapStatus, { type MapLoadState } from '../MapStatus.tsx';
import { applyCityBoundary, MAP_ID } from '../cityBoundary.ts';
import { observeTheme, readMapTheme, themeMapOptions } from '../mapTheme.ts';
import {
  boundsOf,
  maskRings,
  neighborhoodsBounds,
  neighborhoodStyle,
  outerRings,
  padBounds,
  type LatLngTuple,
  type MapPalette,
  type NeighborhoodState,
} from './mapGeometry.ts';

import type { DeliveryZone, Neighborhood, StoreGeo } from '../../../api/store/store.ts';

const toPath = (ring: LatLngTuple[]) =>
  ring.map(([lat, lng]) => ({ lat, lng }));
const toLiteral = ([[south, west], [north, east]]: [
  LatLngTuple,
  LatLngTuple,
]) => ({ south, west, north, east });

/** Cores do mapa saem dos tokens de `theme.css` — nada de hex aqui. */
function readPalette(): MapPalette {
  const theme = readMapTheme();
  return {
    accent: theme.accent,
    danger: theme.danger,
    canvas: theme.background,
  };
}

interface DeliveryMapProps {
  geo: StoreGeo;
  /** Zonas por `normalizeNeighborhood(nome)`. */
  zonesByKey: Map<string, DeliveryZone>;
  selectedKey: string | null;
  onSelect: (neighborhood: Neighborhood) => void;
}

export function DeliveryMapSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="delivery-map-skeleton"
      className="h-[420px] w-full animate-pulse rounded-xl bg-skeleton lg:h-[520px]"
    />
  );
}

/**
 * Mapa da área de entrega: só a cidade escolhida em destaque (resto coberto
 * pela máscara), bairros do OSM clicáveis. Clique → `onSelect`; a taxa é
 * editada fora do mapa. Google Maps é imperativo — o React só entrega o `<div>`
 * (e o rótulo de hover, que o Google não tem).
 */
export default function DeliveryMap({
  geo,
  zonesByKey,
  selectedKey,
  onSelect,
}: DeliveryMapProps) {
  const t = useT();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef(new Map<string, google.maps.Polygon>());
  const labelsRef = useRef(new Map<string, string>());
  const paletteRef = useRef<MapPalette | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [state, setState] = useState<MapLoadState>('loading');
  const [hover, setHover] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);

  const stateOf = (key: string): NeighborhoodState =>
    key === selectedKey
      ? 'selected'
      : zonesByKey.has(key)
        ? 'configured'
        : 'idle';
  const stateOfRef = useRef(stateOf);
  stateOfRef.current = stateOf;

  // Monta o mapa uma vez por cidade.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let cleanup = () => {};
    setState('loading');

    loadGoogleMaps().then(
      async (maps: GoogleMaps) => {
        if (cancelled) return;
        const palette = readPalette();
        paletteRef.current = palette;

        const cityBounds = boundsOf(geo.cityGeometry);
        const map = new maps.Map(container, {
          center: { lat: 0, lng: 0 },
          zoom: 2,
          minZoom: 9,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          ...themeMapOptions(readMapTheme(), MAP_ID),
        });

        // Limita a navegação antes de enquadrar, senão o `restriction`
        // reposiciona a câmera depois do fitBounds.
        if (cityBounds) {
          map.setOptions({
            restriction: {
              latLngBounds: toLiteral(padBounds(cityBounds, 0.5)),
              strictBounds: false,
            },
          });
        }

        // Contorno da cidade: o do próprio Google quando o Map ID permite (o
        // mesmo perímetro pontilhado do google.com/maps); senão, o município
        // do OSM com máscara "mundo menos a cidade".
        const boundary = await applyCityBoundary(
          maps,
          map,
          { name: geo.cityName, state: geo.state },
          palette,
        );
        if (cancelled) {
          boundary?.remove();
          return;
        }
        const overlays: google.maps.Polygon[] = [];
        let mask: google.maps.Polygon | null = null;
        let outline: google.maps.Polygon | null = null;
        if (!boundary) {
          mask = new maps.Polygon({
            map,
            paths: maskRings(geo.cityGeometry).map(toPath),
            strokeWeight: 0,
            fillColor: palette.canvas,
            fillOpacity: 0.85,
            clickable: false,
            zIndex: 0,
          });
          outline = new maps.Polygon({
            map,
            paths: outerRings(geo.cityGeometry).map(toPath),
            strokeColor: palette.danger,
            strokeWeight: 2,
            fillOpacity: 0,
            clickable: false,
            zIndex: 0,
          });
          overlays.push(mask, outline);
        }

        const layers = layersRef.current;
        layers.clear();
        const showLabel = (key: string, event: google.maps.PolyMouseEvent) => {
          const label = labelsRef.current.get(key);
          const dom = event.domEvent as MouseEvent | undefined;
          const box = wrapperRef.current?.getBoundingClientRect();
          if (!label || !dom || !box) return;
          setHover({
            label,
            x: dom.clientX - box.left,
            y: dom.clientY - box.top,
          });
        };
        for (const n of geo.neighborhoods) {
          const polygon = new maps.Polygon({
            map,
            paths: outerRings(n.geometry).map(toPath),
            ...neighborhoodStyle(stateOfRef.current(n.key), palette),
          });
          polygon.addListener('click', () => onSelectRef.current(n));
          polygon.addListener('mousemove', (e: google.maps.PolyMouseEvent) =>
            showLabel(n.key, e),
          );
          polygon.addListener('mouseout', () => setHover(null));
          layers.set(n.key, polygon);
        }

        // Os bairros ficam na mancha urbana; enquadra neles quando existem,
        // senão na cidade toda.
        const initial = neighborhoodsBounds(geo.neighborhoods) ?? cityBounds;
        if (initial) map.fitBounds(toLiteral(initial), 16);

        // Tema trocou (data-theme no <html>): recolore com os tokens novos.
        const stopTheme = observeTheme(() => {
          const next = readPalette();
          paletteRef.current = next;
          const theme = readMapTheme();
          if (MAP_ID) map.setOptions(themeMapOptions(theme, MAP_ID));
          else
            map.setOptions({
              styles: themeMapOptions(theme, undefined).styles,
            });
          boundary?.restyle(next);
          mask?.setOptions({ fillColor: next.canvas });
          outline?.setOptions({ strokeColor: next.danger });
          for (const [key, layer] of layers) {
            layer.setOptions(neighborhoodStyle(stateOfRef.current(key), next));
          }
        });

        cleanup = () => {
          stopTheme();
          for (const layer of layers.values()) layer.setMap(null);
          layers.clear();
          for (const overlay of overlays) overlay.setMap(null);
          boundary?.remove();
        };
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
      cleanup();
      paletteRef.current = null;
      setHover(null);
    };
  }, [geo]);

  // Seleção / taxas mudaram: só restiliza e atualiza os rótulos de hover.
  useEffect(() => {
    const palette = paletteRef.current;
    if (state !== 'ready' || !palette) return;
    for (const n of geo.neighborhoods) {
      const layer = layersRef.current.get(n.key);
      if (!layer) continue;
      layer.setOptions(neighborhoodStyle(stateOf(n.key), palette));
      const zone = zonesByKey.get(n.key);
      labelsRef.current.set(
        n.key,
        zone
          ? `${n.name} · ${formatBRL(zone.feeCents)}`
          : `${n.name} · ${t('delivery.map.noFee')}`,
      );
    }
    // `stateOf` deriva de selectedKey/zonesByKey, já nas deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, geo, zonesByKey, selectedKey, t]);

  return (
    <div
      ref={wrapperRef}
      role="region"
      aria-label={t('delivery.map.label')}
      className="relative h-[420px] w-full overflow-hidden rounded-xl border border-line lg:h-[520px]"
    >
      <div ref={containerRef} className="h-full w-full" />
      <MapStatus state={state} />
      {hover && (
        <div
          role="tooltip"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
          className="pointer-events-none absolute z-10 rounded-lg border border-strong bg-surface px-2 py-1 text-xs text-fg"
        >
          {hover.label}
        </div>
      )}
    </div>
  );
}
