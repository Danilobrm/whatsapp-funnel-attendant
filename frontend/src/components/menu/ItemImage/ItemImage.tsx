import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

import { API_BASE_URL } from '../../../api/client/client.ts';

type ItemImageSize = 'sm' | 'md' | 'full' | 'cover';

/**
 * `image_url` do backend é relativo (`/produtos/x.png`) — em dev, front e
 * back rodam em portas diferentes, então um `<img src="/produtos/...">` bate
 * no Vite (:5173), não na API (:3000), e cai 404 → placeholder. Resolve
 * contra `API_BASE_URL` só quando é relativo; uma URL absoluta (S3, mais
 * tarde) passa direto.
 */
function resolveSrc(src: string): string {
  return src.startsWith('/') ? `${API_BASE_URL}${src}` : src;
}

interface ItemImageProps {
  src: string | null;
  alt: string;
  size?: ItemImageSize;
  className?: string;
}

const SIZE_CLASSES: Record<ItemImageSize, string> = {
  sm: 'h-14 w-14',
  md: 'h-24 w-24',
  full: 'aspect-square w-full',
  cover: 'aspect-[4/3] w-full',
};

const ICON_CLASSES: Record<ItemImageSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  full: 'h-12 w-12',
  cover: 'h-10 w-10',
};

/** Foto do item, com fallback pra ícone quando não há `src` ou o link quebrou. */
export default function ItemImage({
  src,
  alt,
  size = 'sm',
  className = '',
}: ItemImageProps) {
  const [errored, setErrored] = useState(false);

  // Reseta o erro quando o link muda (edição de outro item reusa a instância).
  useEffect(() => {
    setErrored(false);
  }, [src]);

  const showPlaceholder = !src || errored;
  const sizeClass = SIZE_CLASSES[size];

  if (showPlaceholder) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex ${sizeClass} flex-none items-center justify-center rounded-xl bg-hover text-fg-subtle ${className}`}
      >
        <ImageOff
          className={ICON_CLASSES[size]}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
    );
  }

  return (
    <img
      src={resolveSrc(src)}
      alt={alt}
      onError={() => setErrored(true)}
      className={`${sizeClass} flex-none rounded-xl border border-line object-cover ${className}`}
    />
  );
}
