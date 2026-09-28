import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';

type ItemImageSize = 'sm' | 'md';

interface ItemImageProps {
  src: string | null;
  alt: string;
  size?: ItemImageSize;
  className?: string;
}

const SIZE_CLASSES: Record<ItemImageSize, string> = {
  sm: 'h-14 w-14',
  md: 'h-24 w-24',
};

const ICON_CLASSES: Record<ItemImageSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
};

/** Foto do item, com fallback pra ícone quando não há `src` ou o link quebrou. */
export default function ItemImage({ src, alt, size = 'sm', className = '' }: ItemImageProps) {
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
        <ImageOff className={ICON_CLASSES[size]} strokeWidth={1.5} aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      className={`${sizeClass} flex-none rounded-xl border border-line object-cover ${className}`}
    />
  );
}
