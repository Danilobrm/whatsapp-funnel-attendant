import { Globe } from 'lucide-react';

interface FlagIconProps {
  /** Código do idioma, ex.: `pt-BR`. */
  code: string;
  /** Texto acessível — vem do i18n, nunca literal aqui. */
  title: string;
  className?: string;
}

/**
 * Bandeira do idioma.
 *
 * As cores são fixas por especificação da bandeira nacional — não são cor de
 * tema e por isso NÃO saem de `theme.css`. Todo o resto da UI segue os tokens.
 * SVG em vez de emoji porque emoji de bandeira não renderiza no Windows.
 */
export default function FlagIcon({
  code,
  title,
  className = '',
}: FlagIconProps) {
  if (code === 'pt-BR') {
    return (
      <svg
        viewBox="0 0 28 20"
        role="img"
        aria-label={title}
        className={`h-5 w-7 flex-none rounded-[3px] ${className}`}
      >
        <rect width="28" height="20" rx="3" fill="#009B3A" />
        <path d="M14 3.2 24.4 10 14 16.8 3.6 10Z" fill="#FEDF00" />
        <circle cx="14" cy="10" r="3.9" fill="#002776" />
      </svg>
    );
  }

  return (
    <Globe
      className={`h-5 w-5 flex-none text-fg-subtle ${className}`}
      aria-label={title}
      role="img"
      strokeWidth={1.75}
    />
  );
}
