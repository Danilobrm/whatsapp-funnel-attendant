import { darkMapStyles } from './DeliveryMap/mapGeometry.ts';

/**
 * Cores dos mapas saem dos tokens de `theme.css` (nada de hex nos componentes).
 * O Google não lê variáveis CSS, então resolvemos em runtime e reaplicamos
 * quando o `data-theme` do <html> muda (ver `observeTheme`).
 */
export interface MapTheme {
  accent: string;
  danger: string;
  background: string;
  text: string;
  border: string;
  dark: boolean;
}

export function readMapTheme(): MapTheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    accent: v('--accent'),
    danger: v('--danger'),
    background: v('--background'),
    text: v('--text-primary'),
    border: v('--border'),
    dark: root.getAttribute('data-theme') === 'dark',
  };
}

/**
 * Opções de tema do mapa. Com Map ID o estilo vem da nuvem e `styles` é
 * proibido: o escuro vira `colorScheme`. Sem Map ID, JSON de estilo.
 */
export function themeMapOptions(
  theme: MapTheme,
  mapId: string | undefined,
): google.maps.MapOptions {
  return mapId
    ? { mapId, colorScheme: theme.dark ? 'DARK' : 'LIGHT' }
    : { styles: mapStylesFor(theme) };
}

/** `styles` do mapa: escuro a partir dos tokens; claro = visual nativo. */
export function mapStylesFor(
  theme: MapTheme,
): google.maps.MapTypeStyle[] | null {
  return theme.dark ? darkMapStyles(theme) : null;
}

/** Chama `onChange` quando o tema (`data-theme`) troca. Devolve o cleanup. */
export function observeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}
