import type { GoogleMaps } from '../../lib/googleMaps.ts';
import type { MapPalette } from './DeliveryMap/mapGeometry.ts';

/**
 * Contorno da cidade do próprio Google ("data-driven styling for boundaries"):
 * é o perímetro pontilhado que o google.com/maps mostra ao pesquisar a cidade.
 * Só existe com um Map ID (vetorial) que tenha a camada "Locality" ativada no
 * Google Cloud — sem isso devolvemos `null` e o chamador desenha o município
 * do OSM no lugar. Bairros não existem nessa API no Brasil (continuam OSM).
 */

export const MAP_ID: string | undefined = import.meta.env
  .VITE_GOOGLE_MAPS_MAP_ID;

/** `place_id` da cidade (tipo `locality`) pelo Geocoder do navegador. */
export async function findCityPlaceId(
  maps: GoogleMaps,
  cityName: string,
  state: string | null,
): Promise<string | null> {
  try {
    const { results } = await new maps.Geocoder().geocode({
      address: [cityName, state, 'Brasil'].filter(Boolean).join(', '),
      componentRestrictions: { country: 'BR' },
    });
    return results.find((r) => r.types.includes('locality'))?.place_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Pinta o contorno da cidade com a camada LOCALITY do Google. `null` = não
 * disponível (sem Map ID, camada não habilitada, cidade não achada).
 */
export async function applyCityBoundary(
  maps: GoogleMaps,
  map: google.maps.Map,
  city: { name: string; state: string | null },
  palette: MapPalette,
): Promise<{ restyle: (next: MapPalette) => void; remove: () => void } | null> {
  if (!MAP_ID || typeof map.getFeatureLayer !== 'function') return null;
  const layer = map.getFeatureLayer(maps.FeatureType.LOCALITY);
  if (!layer.isAvailable) return null;
  const placeId = await findCityPlaceId(maps, city.name, city.state);
  if (!placeId) return null;

  const apply = (p: MapPalette) => {
    layer.style = (options) =>
      (options.feature as google.maps.PlaceFeature).placeId === placeId
        ? {
            strokeColor: p.danger,
            strokeOpacity: 1,
            strokeWeight: 2,
            fillColor: p.canvas,
            fillOpacity: 0.08,
          }
        : null;
  };
  apply(palette);
  return {
    restyle: apply,
    remove: () => {
      layer.style = null;
    },
  };
}
