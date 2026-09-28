import { useEffect, useState, type ReactNode } from 'react';
import { Bot, Briefcase, Cpu, Smile, Zap } from 'lucide-react';

import {
  fetchBotSettings,
  saveBotSettings,
  SettingsRejectedError,
  type BotGender,
  type BotPersonality,
  type BotSettings,
  type BotSettingsOptions,
  type PersonaPreview,
} from '../../api/settings';
import BotNameField, {
  BotNameFieldSkeleton,
} from '../../components/settings/BotNameField';
import LanguageList, {
  LanguageListSkeleton,
  type LanguageItem,
} from '../../components/settings/LanguageList';
import OptionCardGroup, {
  OptionCardGroupSkeleton,
  type OptionCardItem,
} from '../../components/settings/OptionCardGroup';
import PersonaPreviewCard, {
  PersonaPreviewCardSkeleton,
} from '../../components/settings/PersonaPreviewCard';
import SyncStatus, {
  type SyncStatusState,
} from '../../components/settings/SyncStatus';
import { useT } from '../../i18n/index.tsx';

// Tempo parado depois da última edição antes de salvar sozinho. Curto o
// bastante pra parecer instantâneo, longo o bastante pra não salvar a cada
// tecla digitada no nome do bot.
const AUTOSAVE_DELAY_MS = 700;

const PERSONALITY_ICONS: Record<BotPersonality, ReactNode> = {
  friendly: <Smile className="h-4 w-4" strokeWidth={1.75} />,
  formal: <Briefcase className="h-4 w-4" strokeWidth={1.75} />,
  objective: <Zap className="h-4 w-4" strokeWidth={1.75} />,
  technical: <Cpu className="h-4 w-4" strokeWidth={1.75} />,
};

interface CardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

// Padrão de card das páginas do admin — mesma largura, mesmo padding externo e
// mesmo componente de seção. Novas páginas (pedidos, cardápio) seguem este.
function Card({ title, subtitle, children }: CardProps) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <header className="mb-5">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; code: string };

export default function Settings() {
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [options, setOptions] = useState<BotSettingsOptions | null>(null);
  const [preview, setPreview] = useState<PersonaPreview | null>(null);
  const [saved, setSaved] = useState<BotSettings | null>(null);
  const [draft, setDraft] = useState<BotSettings | null>(null);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;

    fetchBotSettings()
      .then((data) => {
        if (cancelled) return;
        setOptions(data.options);
        setPreview(data.preview);
        setSaved(data.settings);
        setDraft(data.settings);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function patch(next: Partial<BotSettings>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
  }

  function toggleLanguage(code: string, enabled: boolean) {
    setDraft((current) => {
      if (!current) return current;
      const languages = enabled
        ? [...new Set([...current.languages, code])]
        : current.languages.filter((l) => l !== code);
      return { ...current, languages };
    });
  }

  async function submit(next: BotSettings) {
    setSave({ status: 'saving' });
    try {
      const result = await saveBotSettings({
        name: next.name,
        personality: next.personality,
        gender: next.gender,
        languages: next.languages,
      });
      setSaved(result.settings);
      setDraft(result.settings);
      setPreview(result.preview);
      setSave({ status: 'saved' });
    } catch (err) {
      setSave({
        status: 'error',
        code: err instanceof SettingsRejectedError ? err.code : 'generic',
      });
    }
  }

  const dirty =
    draft !== null &&
    saved !== null &&
    JSON.stringify(draft) !== JSON.stringify(saved);

  // Auto-salva sozinho: nada de botão "aplicar". Roda no `draft` como
  // snapshot fechado no timeout — não em `submit`, cuja identidade muda a
  // cada render e reiniciaria o debounce sem parar.
  useEffect(() => {
    if (loading || !dirty || !draft) return;

    const timer = setTimeout(() => {
      void submit(draft);
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [draft, dirty, loading]);

  const saving = save.status === 'saving';

  const syncState: SyncStatusState = saving
    ? 'syncing'
    : save.status === 'saved'
      ? 'synced'
      : dirty
        ? 'pending'
        : 'idle';

  const errorMessage =
    save.status === 'error'
      ? t(`settings.errors.${save.code}`) === `settings.errors.${save.code}`
        ? t('settings.errors.generic')
        : t(`settings.errors.${save.code}`)
      : null;

  const personalityOptions: OptionCardItem[] = (
    options?.personalities ?? []
  ).map((value) => ({
    value,
    title: t(`settings.personality.${value}.title`),
    description: t(`settings.personality.${value}.description`),
    icon: PERSONALITY_ICONS[value],
  }));

  const genderOptions: OptionCardItem[] = (options?.genders ?? []).map(
    (value) => ({
      value,
      title: t(`settings.gender.${value}.title`),
      description: t(`settings.gender.${value}.description`),
    }),
  );

  // Um idioma só: travado ligado. Desligar o único idioma deixaria o bot mudo,
  // e o backend rejeitaria com `languages_required`.
  const languageItems: LanguageItem[] = (options?.languages ?? []).map(
    (code) => ({
      code,
      label: t(`settings.languages.${code}.label`),
      description: t(`settings.languages.${code}.description`),
      enabled: draft?.languages.includes(code) ?? false,
      locked: (options?.languages.length ?? 0) <= 1,
      lockedHint: t('settings.languages.locked'),
    }),
  );

  // Uma única área rolável: o container abaixo. O AdminLayout já corta o
  // overflow acima dele, então nada aqui pode criar uma segunda barra. A
  // largura e o padding são o padrão das páginas do admin — sem `max-w`, sem
  // padding extra — pra caber na tela sem rolar à toa.
  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex w-full flex-col gap-6 px-8 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-hover text-fg">
              <Bot className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <h1 className="text-xl font-medium text-fg">
                {t('settings.title')}
              </h1>
              <p className="text-sm text-fg-muted">{t('settings.subtitle')}</p>
            </div>
          </div>

          <SyncStatus
            state={syncState}
            pendingLabel={t('settings.sync.pending')}
            syncingLabel={t('settings.sync.syncing')}
            syncedLabel={t('settings.sync.synced')}
          />
        </header>

        {loadError && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {t('settings.loadError')}
          </p>
        )}

        {errorMessage && (
          <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-2">
            <Card
              title={t('settings.identity.title')}
              subtitle={t('settings.identity.subtitle')}
            >
              {/* Empilhado, não lado a lado: um grid de 2 colunas aqui força
                  a coluna do nome a esticar até a altura dos 3 cards de
                  gênero, deixando um vazio enorme embaixo do input. */}
              <div className="flex flex-col gap-6">
                <div className="max-w-sm min-w-0">
                  {loading ? (
                    <BotNameFieldSkeleton />
                  ) : (
                    <BotNameField
                      label={t('settings.name.label')}
                      hint={t('settings.name.hint')}
                      placeholder={t('settings.name.placeholder')}
                      value={draft?.name ?? ''}
                      onChange={(name) => patch({ name })}
                      disabled={saving}
                    />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="mb-3 text-sm font-medium text-fg">
                    {t('settings.gender.title')}
                  </p>
                  {loading ? (
                    <OptionCardGroupSkeleton options={3} columns={3} />
                  ) : (
                    <OptionCardGroup
                      legend={t('settings.gender.title')}
                      name="bot-gender"
                      value={draft?.gender ?? ''}
                      options={genderOptions}
                      onChange={(gender) =>
                        patch({ gender: gender as BotGender })
                      }
                      disabled={saving}
                      columns={3}
                    />
                  )}
                </div>
              </div>
            </Card>

            <Card
              title={t('settings.personality.title')}
              subtitle={t('settings.personality.subtitle')}
            >
              {loading ? (
                <OptionCardGroupSkeleton options={4} columns={4} />
              ) : (
                <OptionCardGroup
                  legend={t('settings.personality.title')}
                  name="bot-personality"
                  value={draft?.personality ?? ''}
                  options={personalityOptions}
                  onChange={(personality) =>
                    patch({ personality: personality as BotPersonality })
                  }
                  disabled={saving}
                  columns={4}
                />
              )}
              <p className="mt-4 text-[13px] text-fg-subtle">
                {t('settings.scope')}
              </p>
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <Card
              title={t('settings.languages.title')}
              subtitle={t('settings.languages.subtitle')}
            >
              {loading ? (
                <LanguageListSkeleton rows={1} />
              ) : (
                <LanguageList
                  items={languageItems}
                  onToggle={toggleLanguage}
                  activeLabel={t('settings.languages.active')}
                />
              )}
            </Card>

            <Card
              title={t('settings.preview.title')}
              subtitle={t('settings.preview.subtitle')}
            >
              {loading || !preview ? (
                <PersonaPreviewCardSkeleton />
              ) : (
                <PersonaPreviewCard
                  preview={preview}
                  labels={{
                    greeting: t('settings.preview.greeting'),
                    identity: t('settings.preview.identity'),
                    fallback: t('settings.preview.fallback'),
                    junk: t('settings.preview.junk'),
                  }}
                />
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
