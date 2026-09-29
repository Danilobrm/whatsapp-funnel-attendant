import type { AreaGeometry, GeoPosition } from '../../../api/store/store.ts';

/**
 * Funções puras do mapa de entrega (sem Google Maps) — testáveis em jsdom.
 * GeoJSON é [lon, lat]; o mapa usa [lat, lng]. A troca acontece SÓ aqui.
 */

export type LatLngTuple = [number, number];

const toLatLng = ([lon, lat]: GeoPosition): LatLngTuple => [lat, lon];

/** Anéis externos da área (um por parte do MultiPolygon). */
export function outerRings(geometry: AreaGeometry): LatLngTuple[][] {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap((polygon) =>
    polygon[0] ? [polygon[0].map(toLatLng)] : [],
  );
}

/** Área com sinal (fórmula do cadarço; x = lng, y = lat). > 0 = anti-horário. */
function signedArea(ring: LatLngTuple[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lat1, lng1] = ring[i] as LatLngTuple;
    const [lat2, lng2] = ring[(i + 1) % ring.length] as LatLngTuple;
    sum += lng1 * lat2 - lng2 * lat1;
  }
  return sum / 2;
}

/**
 * Máscara "o mundo menos a cidade": um retângulo enorme com a cidade como
 * buraco. Pintada com a cor do fundo, apaga tudo fora da área atendida — é o
 * que deixa só a cidade em destaque. O Google só fura o polígono quando o
 * buraco gira no sentido OPOSTO ao do anel externo, e o OSM não garante o
 * sentido dos anéis: normalizamos aqui (mundo anti-horário, buracos horários).
 */
export function maskRings(geometry: AreaGeometry): LatLngTuple[][] {
  const world: LatLngTuple[] = [
    [-89, -179],
    [-89, 179],
    [89, 179],
    [89, -179],
  ];
  const holes = outerRings(geometry).map((ring) =>
    signedArea(ring) > 0 ? [...ring].reverse() : ring,
  );
  return [world, ...holes];
}

/** Aumenta a caixa em `ratio` de cada lado (limita a área navegável). */
export function padBounds(
  [[south, west], [north, east]]: [LatLngTuple, LatLngTuple],
  ratio: number,
): [LatLngTuple, LatLngTuple] {
  const dLat = (north - south) * ratio;
  const dLng = (east - west) * ratio;
  return [
    [Math.max(-85, south - dLat), Math.max(-180, west - dLng)],
    [Math.min(85, north + dLat), Math.min(180, east + dLng)],
  ];
}

/** Caixa [[sul, oeste], [norte, leste]] da área — pra `fitBounds`. */
export function boundsOf(
  geometry: AreaGeometry,
): [LatLngTuple, LatLngTuple] | null {
  const points = outerRings(geometry).flat();
  if (points.length === 0) return null;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const [lat, lng] of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return [
    [south, west],
    [north, east],
  ];
}

/** Caixa que envolve todos os bairros — a mancha urbana. */
export function neighborhoodsBounds(
  neighborhoods: { geometry: AreaGeometry }[],
): [LatLngTuple, LatLngTuple] | null {
  const boxes = neighborhoods
    .map((n) => boundsOf(n.geometry))
    .filter((b): b is [LatLngTuple, LatLngTuple] => b !== null);
  if (boxes.length === 0) return null;
  return [
    [
      Math.min(...boxes.map((b) => b[0][0])),
      Math.min(...boxes.map((b) => b[0][1])),
    ],
    [
      Math.max(...boxes.map((b) => b[1][0])),
      Math.max(...boxes.map((b) => b[1][1])),
    ],
  ];
}

export type NeighborhoodState = 'selected' | 'configured' | 'idle';

export interface MapPalette {
  accent: string;
  danger: string;
  canvas: string;
}

/**
 * Estilo de cada bairro (opções de `google.maps.Polygon`): contorno vermelho,
 * preenchido quando tem taxa. O Google não desenha traço pontilhado em
 * polígono, então a diferença entre estados fica em espessura/opacidade.
 * `zIndex` põe o selecionado por cima.
 */
export function neighborhoodStyle(
  state: NeighborhoodState,
  palette: MapPalette,
) {
  switch (state) {
    case 'selected':
      return {
        strokeColor: palette.danger,
        strokeWeight: 3,
        strokeOpacity: 1,
        fillColor: palette.danger,
        fillOpacity: 0.18,
        zIndex: 3,
      };
    case 'configured':
      return {
        strokeColor: palette.accent,
        strokeWeight: 1.5,
        strokeOpacity: 1,
        fillColor: palette.accent,
        fillOpacity: 0.22,
        zIndex: 2,
      };
    default:
      return {
        strokeColor: palette.danger,
        strokeWeight: 1,
        strokeOpacity: 0.55,
        fillColor: palette.canvas,
        fillOpacity: 0.05,
        zIndex: 1,
      };
  }
}

export interface MapThemeColors {
  background: string;
  text: string;
  border: string;
}

/**
 * Tema escuro do mapa (`google.maps.MapTypeStyle[]`), montado dos tokens do
 * `theme.css` — o JSON de estilo do Google não aceita `var(--x)`, então as
 * cores entram já resolvidas. Claro = `null` (visual nativo do Google).
 */
export function darkMapStyles(
  colors: MapThemeColors,
): google.maps.MapTypeStyle[] {
  return [
    { elementType: 'geometry', stylers: [{ color: colors.background }] },
    { elementType: 'labels.text.fill', stylers: [{ color: colors.text }] },
    {
      elementType: 'labels.text.stroke',
      stylers: [{ color: colors.background }],
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: colors.border }],
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: colors.border }],
    },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ];
}
