import { Check, X } from 'lucide-react';
import { useEffect } from 'react';

import { availableLocales, useI18n, useT } from '../../i18n/index.tsx';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Painel de preferências da sessão administrativa — hoje só o idioma da UI. */
export default function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const t = useT();
  const { locale, setLocale } = useI18n();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      {/* Fecha ao clicar fora — decorativo: a ação com nome acessível é o
          botão "Fechar" no cabeçalho, e Escape cobre o teclado. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('account.settingsTitle')}
        className="relative z-10 flex h-full w-full max-w-sm flex-col border-l border-line bg-surface shadow-lg"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="text-base font-semibold text-fg">
              {t('account.settingsTitle')}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {t('account.settingsSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('account.close')}
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-fg-muted transition hover:bg-hover hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <fieldset>
            <legend className="text-sm font-medium text-fg">
              {t('account.language.title')}
            </legend>
            <p className="mt-1 text-[13px] text-fg-muted">
              {t('account.language.subtitle')}
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {availableLocales.map((code) => {
                const selected = code === locale;
                return (
                  <label
                    key={code}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition ${
                      selected
                        ? 'border-accent bg-hover'
                        : 'border-line hover:bg-hover'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="ui-locale"
                        className="sr-only"
                        value={code}
                        checked={selected}
                        onChange={() => setLocale(code)}
                      />
                      <span className="text-sm font-medium text-fg">
                        {t(`account.language.${code}`)}
                      </span>
                    </span>
                    {selected && (
                      <Check
                        className="h-4 w-4 text-accent"
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
