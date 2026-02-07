import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  IconBot,
  IconExternal,
  IconFile,
  IconKanban,
  IconLayout,
  IconModel,
  IconReport,
  IconSpark,
  IconSettings,
  IconWorkflow,
} from '../ui/Icons';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { useTranslation } from 'react-i18next';

export function Sidebar({
  selectedPage,
  onSelectPage,
  mobileOpen = false,
  onCloseMobile,
}: {
  selectedPage: 'dashboard' | 'kanban' | 'automations' | 'docs' | 'memory' | 'agents' | 'skills' | 'models';
  onSelectPage: (p: 'dashboard' | 'kanban' | 'automations' | 'docs' | 'memory' | 'agents' | 'skills' | 'models') => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const platformSettingsUrl = (import.meta as any).env?.VITE_PLATFORM_SETTINGS_URL as string | undefined;
  const envOpenclawPath = (import.meta as any).env?.VITE_OPENCLAW_PATH as string | undefined;
  const derivedPath = (() => {
    if (envOpenclawPath && envOpenclawPath.trim()) return envOpenclawPath.trim();
    const host = window?.location?.hostname ?? '';
    if (host === 'localhost' || host === '127.0.0.1') return '/';
    return '/openclaw';
  })();
  const openclawHref = derivedPath.startsWith('http')
    ? derivedPath
    : derivedPath.startsWith('/')
      ? derivedPath
      : `/${derivedPath}`;
  const settingsHref = platformSettingsUrl && platformSettingsUrl.trim() ? platformSettingsUrl.trim() : '';
  const lang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';
  const appVersion =
    (((import.meta as any).env?.VITE_APP_VERSION as string | undefined)?.trim() ||
      ((import.meta as any).env?.VITE_DZZENOS_VERSION as string | undefined)?.trim() ||
      ((import.meta as any).env?.VITE_PACKAGE_VERSION as string | undefined)?.trim() ||
      '0.0.0');
  const releaseTag = appVersion.match(/^(\d+\.\d+\.\d+)/)?.[1] ?? null;
  const versionHref = releaseTag
    ? `https://github.com/Dzzen-com/DzzenOS-OpenClaw/releases/tag/v${releaseTag}`
    : 'https://github.com/Dzzen-com/DzzenOS-OpenClaw';
  const languageOptions: Array<{ code: 'en' | 'ru'; label: string; flag: string }> = [
    { code: 'en', label: t('English'), flag: '🇺🇸' },
    { code: 'ru', label: t('Russian'), flag: '🇷🇺' },
  ];
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    const repo = 'Dzzen-com/DzzenOS-OpenClaw';
    const storageVersionKey = 'dzzenos_update_latest_version';
    const storageUrlKey = 'dzzenos_update_latest_url';
    const storageCheckedKey = 'dzzenos_update_checked_at';
    const intervalMs = 12 * 60 * 60 * 1000;
    const now = Date.now();

    const normalize = (value: string) => value.trim().replace(/^v/i, '');
    const compare = (a: string, b: string) => {
      const pa = normalize(a).split(/[^\d]+/).filter(Boolean).map(Number);
      const pb = normalize(b).split(/[^\d]+/).filter(Boolean).map(Number);
      const n = Math.max(pa.length, pb.length);
      for (let i = 0; i < n; i += 1) {
        const av = pa[i] ?? 0;
        const bv = pb[i] ?? 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
      }
      return 0;
    };

    const cachedVersion = localStorage.getItem(storageVersionKey)?.trim() || '';
    const cachedUrl = localStorage.getItem(storageUrlKey)?.trim() || '';
    if (cachedVersion && compare(cachedVersion, appVersion) > 0) {
      setUpdateInfo({
        version: cachedVersion,
        url: cachedUrl || `https://github.com/${repo}/releases`,
      });
    }

    const checkedAt = Number(localStorage.getItem(storageCheckedKey) || 0);
    if (Number.isFinite(checkedAt) && now - checkedAt < intervalMs) return;

    void fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { tag_name?: string; html_url?: string };
        const latest = (data.tag_name ?? '').trim();
        if (!latest) return;
        const url = (data.html_url ?? '').trim() || `https://github.com/${repo}/releases`;
        localStorage.setItem(storageVersionKey, latest);
        localStorage.setItem(storageUrlKey, url);
        localStorage.setItem(storageCheckedKey, String(Date.now()));
        if (compare(latest, appVersion) > 0) {
          setUpdateInfo({ version: latest, url });
        } else {
          setUpdateInfo(null);
        }
      })
      .catch(() => {
        localStorage.setItem(storageCheckedKey, String(Date.now()));
      });
  }, [appVersion]);

  return (
    <>
    <aside
      onTouchStart={(e) => {
        if (!mobileOpen) return;
        const t = e.touches[0];
        touchStartX.current = t.clientX;
        touchStartY.current = t.clientY;
      }}
      onTouchMove={(e) => {
        if (!mobileOpen) return;
        const t = e.touches[0];
        const startX = touchStartX.current;
        const startY = touchStartY.current;
        if (startX == null || startY == null) return;
        const dx = t.clientX - startX;
        const dy = Math.abs(t.clientY - startY);
        if (dx < -60 && dy < 40) {
          onCloseMobile?.();
          touchStartX.current = null;
          touchStartY.current = null;
        }
      }}
      onTouchEnd={() => {
        touchStartX.current = null;
        touchStartY.current = null;
      }}
      className={
        'fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-border/60 bg-card/90 backdrop-blur transition ' +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full') +
        ' sm:translate-x-0'
      }
    >
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-sky-400 to-teal-400 opacity-90 shadow-sm" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-foreground font-display">DzzenOS</div>
            <div className="text-xs text-muted-foreground">{t('Local')}</div>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-hidden px-2 pb-4">
        <SectionTitle>{t('Workspace')}</SectionTitle>
        <NavItem
          active={selectedPage === 'dashboard'}
          onClick={() => {
            onSelectPage('dashboard');
            onCloseMobile?.();
          }}
          icon={<IconLayout />}
        >
          {t('Dashboard')}
        </NavItem>
        <NavItem
          active={selectedPage === 'kanban'}
          onClick={() => {
            onSelectPage('kanban');
            onCloseMobile?.();
          }}
          icon={<IconKanban />}
        >
          {t('Projects')}
        </NavItem>
        <NavItem
          active={selectedPage === 'automations'}
          onClick={() => {
            onSelectPage('automations');
            onCloseMobile?.();
          }}
          icon={<IconWorkflow />}
        >
          {t('Automations')}
        </NavItem>
        <NavItem
          active={selectedPage === 'agents'}
          onClick={() => {
            onSelectPage('agents');
            onCloseMobile?.();
          }}
          icon={<IconBot />}
        >
          {t('Agent Library')}
        </NavItem>
        <NavItem
          active={selectedPage === 'models'}
          onClick={() => {
            onSelectPage('models');
            onCloseMobile?.();
          }}
          icon={<IconModel />}
        >
          {t('Models')}
        </NavItem>
        <NavItem
          active={selectedPage === 'skills'}
          onClick={() => {
            onSelectPage('skills');
            onCloseMobile?.();
          }}
          icon={<IconSpark />}
        >
          {t('Skills')}
        </NavItem>
        <NavItem
          active={selectedPage === 'docs'}
          onClick={() => {
            onSelectPage('docs');
            onCloseMobile?.();
          }}
          icon={<IconFile />}
        >
          {t('Docs')}
        </NavItem>
        <NavItem
          active={selectedPage === 'memory'}
          onClick={() => {
            onSelectPage('memory');
            onCloseMobile?.();
          }}
          icon={<IconReport />}
        >
          {t('Memory')}
        </NavItem>
      </nav>

      <div className="mt-auto border-t border-border/70 p-2">
        <DropdownMenuRoot open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition hover:bg-surface-2/50 hover:text-foreground"
            >
              <IconSettings className="h-4 w-4" />
              <span>{t('Settings')}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={8} className="z-[70] w-[240px]">
            <DropdownMenuLabel>{t('Platform')}</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!settingsHref}
              onSelect={(e) => {
                e.preventDefault();
                if (!settingsHref) return;
                window.location.href = settingsHref;
              }}
            >
              {t('DzzenOS Settings')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                window.location.href = openclawHref;
              }}
            >
              <IconExternal className="h-4 w-4" />
              {t('OpenClaw Panel')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('Language')}</DropdownMenuLabel>
            <div className="px-2.5 pb-2">
              <select
                value={lang}
                onChange={(e) => {
                  void i18n.changeLanguage(e.target.value);
                }}
                className="h-8 w-full rounded-md border border-input/70 bg-surface-1/70 px-2 text-xs text-foreground"
              >
                {languageOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.flag} {option.label}
                  </option>
                ))}
              </select>
            </div>
          </DropdownMenuContent>
        </DropdownMenuRoot>

        <div className="mt-2 rounded-lg border border-border/70 bg-surface-1/45 p-2.5">
          {updateInfo ? (
            <a
              href={updateInfo.url}
              target="_blank"
              rel="noreferrer"
              className="mb-2 flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning hover:bg-warning/15"
            >
              <span>{t('New version available')}</span>
              <span className="font-mono">{updateInfo.version.startsWith('v') ? updateInfo.version : `v${updateInfo.version}`}</span>
            </a>
          ) : null}
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <a
              href="https://dzzen.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              {t('Powered by Dzzen')}
            </a>
            <a
              href={versionHref}
              target="_blank"
              rel="noreferrer"
              className="font-mono hover:text-foreground"
            >
              v{appVersion}
            </a>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <SocialLink href="https://github.com/Dzzen-com/DzzenOS-OpenClaw" label="GitHub">
              <IconGitHub />
            </SocialLink>
            <SocialLink href="https://x.com/DzzenHQ" label="X">
              <IconX />
            </SocialLink>
            <SocialLink href="https://t.me/dzzenx" label="Telegram">
              <IconTelegram />
            </SocialLink>
            <SocialLink href="https://www.facebook.com/DzzenHQ" label="Facebook">
              <IconFacebook />
            </SocialLink>
            <SocialLink href="https://www.linkedin.com/company/dzzen" label="LinkedIn">
              <IconLinkedIn />
            </SocialLink>
            <SocialLink href="https://dzzen.com" label="Website">
              <IconGlobe />
            </SocialLink>
          </div>
        </div>
      </div>
    </aside>
    {settingsOpen ? (
      <button
        type="button"
        aria-label={t('Close')}
        className="fixed inset-0 z-[65] bg-black/35 backdrop-blur-[1px]"
        onClick={() => setSettingsOpen(false)}
      />
    ) : null}
    </>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function NavItem({
  children,
  active,
  onClick,
  icon,
}: {
  children: string;
  active?: boolean;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ' +
        'text-foreground/90 hover:bg-surface-2/50 ' +
        (active ? 'bg-surface-2/80 text-foreground' : '')
      }
    >
      {icon ? <span className="text-muted-foreground/90">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-surface-2/45 text-muted-foreground transition hover:border-border hover:text-foreground"
    >
      {children}
    </a>
  );
}

function IconX() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M3.2 3h3.2l3.3 4.7L13.6 3H17l-5.7 6.6L17.2 17h-3.2l-3.8-5.4L5.6 17H2.1l6-6.9z" />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M17.5 3.9c.3-.2.7.1.6.5l-2.3 11c-.1.4-.6.6-1 .4l-3.1-2.3-1.7 1.7c-.2.2-.6.1-.7-.2l-.3-3 6.2-5.6-7.6 4.8-3-.9c-.4-.1-.5-.6-.1-.8z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M11.3 17v-6.1h2.1l.3-2.4h-2.4V7c0-.7.2-1.2 1.2-1.2h1.3V3.6c-.2 0-1-.1-1.9-.1-1.8 0-3 .9-3 3.1v1.8H7v2.4h2v6.1z" />
    </svg>
  );
}

function IconLinkedIn() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M4.2 7.1H7V17H4.2zM5.6 3.1a1.6 1.6 0 110 3.2 1.6 1.6 0 010-3.2M8.7 7.1h2.7v1.4h.1c.4-.7 1.3-1.7 2.8-1.7 3 0 3.5 1.9 3.5 4.5V17H15v-4.9c0-1.2 0-2.7-1.7-2.7s-1.9 1.3-1.9 2.6V17H8.7z" />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3a11 11 0 010 14M10 3a11 11 0 000 14" />
    </svg>
  );
}

function IconGitHub() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M10 2.3a7.7 7.7 0 00-2.4 15c.4 0 .5-.2.5-.4v-1.6c-2.1.4-2.5-.9-2.5-.9-.4-.9-.8-1.1-.8-1.1-.7-.5 0-.5 0-.5.8 0 1.2.8 1.2.8.6 1.1 1.7.8 2.1.6 0-.5.2-.8.4-1-1.7-.2-3.5-.8-3.5-3.8 0-.8.3-1.5.8-2-.1-.2-.3-1 0-2 0 0 .7-.2 2.4.8a8 8 0 014.4 0c1.7-1.1 2.4-.8 2.4-.8.4 1 .2 1.8 0 2 .5.5.8 1.2.8 2 0 3-1.8 3.6-3.5 3.8.3.2.5.7.5 1.5V17c0 .2.1.4.5.4A7.7 7.7 0 0010 2.3z" />
    </svg>
  );
}
