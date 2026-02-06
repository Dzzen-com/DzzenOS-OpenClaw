import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../Layout/PageHeader';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';

type Locale = 'en' | 'ru';

type Localized<T> = {
  en: T;
  ru?: T;
};

type DocsCommand = {
  id: string;
  title: Localized<string>;
  description: Localized<string>;
  language: 'bash' | 'http' | 'json';
  code: string;
  assistantPrompt?: string;
};

type DocsLink = {
  label: Localized<string>;
  href: string;
  note?: Localized<string>;
};

type DocsSection = {
  id: string;
  group: Localized<string>;
  title: Localized<string>;
  summary: Localized<string>;
  intro: Localized<string[]>;
  highlights: Localized<string[]>;
  commands?: DocsCommand[];
  links?: DocsLink[];
};

type UiCopy = {
  pageSubtitle: Localized<string>;
  platformDocs: Localized<string>;
  platformLead: Localized<string>;
  searchLabel: Localized<string>;
  searchPlaceholder: Localized<string>;
  noResults: Localized<string>;
  selectSection: Localized<string>;
  relatedDocs: Localized<string>;
  copyPage: Localized<string>;
  copyCode: Localized<string>;
  copy: Localized<string>;
  cursor: Localized<string>;
  codex: Localized<string>;
  claude: Localized<string>;
  copied: Localized<string>;
  copyFailed: Localized<string>;
  triedOpen: Localized<string>;
  commandTip: Localized<string>;
  language: Localized<string>;
  translationNote: Localized<string>;
  pageActionHint: Localized<string>;
};

type AssistantTarget = 'cursor' | 'codex' | 'claude';

const AI_TARGETS: Record<AssistantTarget, { label: string; toUrl: (text: string) => string }> = {
  cursor: {
    label: 'Cursor',
    toUrl: (text) => `cursor://anysphere.cursor-deeplink/new?prompt=${encodeURIComponent(text)}`,
  },
  codex: {
    label: 'Codex',
    toUrl: (text) => `codex://new?prompt=${encodeURIComponent(text)}`,
  },
  claude: {
    label: 'Claude',
    toUrl: (text) => `claude://new?prompt=${encodeURIComponent(text)}`,
  },
};

const UI_COPY: UiCopy = {
  pageSubtitle: {
    en: 'OpenClaw-style documentation for DzzenOS platform.',
    ru: 'Документация платформы DzzenOS в стиле OpenClaw.',
  },
  platformDocs: { en: 'Documentation', ru: 'Документация' },
  platformLead: {
    en: 'Product docs live here. Workspace context now lives in Memory.',
    ru: 'Здесь живет документация платформы. Рабочий контекст перенесен в Memory.',
  },
  searchLabel: { en: 'Search', ru: 'Поиск' },
  searchPlaceholder: {
    en: 'Search features, API, setup, security...',
    ru: 'Поиск по функциям, API, настройке, безопасности...',
  },
  noResults: {
    en: 'No sections found for this search query.',
    ru: 'По вашему запросу разделы не найдены.',
  },
  selectSection: {
    en: 'Select a section from the left navigation.',
    ru: 'Выберите раздел в левой навигации.',
  },
  relatedDocs: { en: 'Related Docs', ru: 'Связанные документы' },
  copyPage: { en: 'Copy Page', ru: 'Копировать страницу' },
  copyCode: { en: 'Copy code', ru: 'Копировать код' },
  copy: { en: 'Copy', ru: 'Копировать' },
  cursor: { en: 'Cursor', ru: 'Cursor' },
  codex: { en: 'Codex', ru: 'Codex' },
  claude: { en: 'Claude', ru: 'Claude' },
  copied: { en: 'Copied', ru: 'Скопировано' },
  copyFailed: { en: 'Copy failed', ru: 'Ошибка копирования' },
  triedOpen: { en: 'Copied and tried opening in', ru: 'Скопировано и попытка открыть в' },
  commandTip: {
    en: 'Assistant buttons copy text first, then try a deep-link.',
    ru: 'Кнопки ассистентов сначала копируют текст, потом открывают deep-link.',
  },
  language: { en: 'Language', ru: 'Язык' },
  translationNote: {
    en: 'English is primary. Some translated wording may lag behind new releases.',
    ru: 'Английская версия основная. Отдельные формулировки перевода могут отставать от новых релизов.',
  },
  pageActionHint: {
    en: 'Page actions apply to the current document section.',
    ru: 'Действия страницы применяются к текущему разделу документа.',
  },
};

const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'start-5-min',
    group: { en: 'Start Here', ru: 'Начало работы' },
    title: { en: 'Start in 5 Minutes', ru: 'Старт за 5 минут' },
    summary: {
      en: 'What DzzenOS is, where to run it, and how to get productive fast.',
      ru: 'Что такое DzzenOS, где его запускать и как быстро войти в рабочий поток.',
    },
    intro: {
      en: [
        'DzzenOS runs natively with OpenClaw. It is not a separate SaaS layer. You manage tasks, agents, automations, and memory in one operating surface.',
        'The baseline flow is simple: create a board, create a task, run an agent, review output, and store context in Memory.',
      ],
      ru: [
        'DzzenOS работает нативно с OpenClaw. Это не отдельный SaaS-слой. Вы управляете задачами, агентами, автоматизациями и памятью в одном интерфейсе.',
        'Базовый поток простой: создайте доску, добавьте задачу, запустите агента, проверьте результат и сохраните контекст в Memory.',
      ],
    },
    highlights: {
      en: [
        'One interface for Founder Ops and Content workflows.',
        'Local-first data model: SQLite + local docs + local API.',
        'Native OpenClaw model and agent integration.',
        'Docs is product documentation, Memory is workspace context.',
      ],
      ru: [
        'Единый интерфейс для Founder Ops и контент-процессов.',
        'Local-first модель данных: SQLite + локальные docs + локальный API.',
        'Нативная интеграция с моделями и агентами OpenClaw.',
        'Docs — документация продукта, Memory — рабочий контекст.',
      ],
    },
    commands: [
      {
        id: 'start-local',
        title: { en: 'Run local development stack', ru: 'Запустить локальный стек разработки' },
        description: { en: 'Starts UI + API for local development.', ru: 'Запускает UI + API для локальной разработки.' },
        language: 'bash',
        code: `pnpm install\npnpm dev`,
      },
      {
        id: 'start-api',
        title: { en: 'Smoke-test API', ru: 'Сделать smoke-тест API' },
        description: { en: 'Quick check before opening the UI.', ru: 'Быстрая проверка перед открытием UI.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/boards | jq',
      },
    ],
    links: [
      {
        label: { en: 'README', ru: 'README' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/README.md',
      },
      {
        label: { en: 'Install Guide', ru: 'Руководство по установке' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/INSTALL.md',
      },
    ],
  },
  {
    id: 'playbook-weekly-review',
    group: { en: 'Playbooks', ru: 'Плейбуки' },
    title: { en: 'Playbook: Weekly Review in 3 Steps', ru: 'Плейбук: Weekly Review за 3 шага' },
    summary: {
      en: 'A short weekly ritual to track blockers, risks, and next actions.',
      ru: 'Короткий еженедельный ритуал для контроля блокеров, рисков и следующих шагов.',
    },
    intro: {
      en: [
        'Step 1: Open Dashboard and check failed/stuck runs plus pending approvals.',
        'Step 2: For top-priority tasks, run plan/report, refine through chat, and set final status in Kanban.',
        'Step 3: Save weekly decisions to Memory via board summary, so next week starts with clean context.',
      ],
      ru: [
        'Шаг 1: откройте Dashboard и проверьте failed/stuck runs и pending approvals.',
        'Шаг 2: по приоритетным задачам запустите plan/report, уточните детали в чате и выставьте финальный статус в Kanban.',
        'Шаг 3: сохраните решения недели в Memory через board summary, чтобы следующая неделя стартовала с чистым контекстом.',
      ],
    },
    highlights: {
      en: [
        'Typical duration: 15-25 minutes.',
        'Focus: blockers, risks, priorities, ownership.',
        'Captures decision history in docs/changelog/memory.',
        'Works for solo founders and small teams.',
      ],
      ru: [
        'Обычно занимает 15-25 минут.',
        'Фокус: блокеры, риски, приоритеты, ответственность.',
        'Фиксирует историю решений в docs/changelog/memory.',
        'Подходит для соло-фаундеров и небольших команд.',
      ],
    },
    commands: [
      {
        id: 'playbook-weekly-summary',
        title: { en: 'Write weekly summary into Memory', ru: 'Сохранить weekly summary в Memory' },
        description: { en: 'Closes the review loop with a durable record.', ru: 'Закрывает weekly review с устойчивой фиксацией результата.' },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/docs/boards/<board-id>/summary \\
  -X POST -H 'content-type: application/json' \\
  -d '{"title":"Weekly review","summary":"- Closed blockers\\n- Set next-week priorities\\n- Updated risk status"}'`,
      },
    ],
  },
  {
    id: 'playbook-content-pipeline',
    group: { en: 'Playbooks', ru: 'Плейбуки' },
    title: { en: 'Playbook: Content Pipeline in 5 Steps', ru: 'Плейбук: Контент-пайплайн за 5 шагов' },
    summary: { en: 'Move from idea to published asset with clear handoffs.', ru: 'Переходите от идеи к публикации с прозрачными этапами.' },
    intro: {
      en: [
        'Step 1: Create idea task in `ideas` with one-line intent.',
        'Step 2: Run `plan` to generate structure and checklist.',
        'Step 3: Move to `doing`, draft through chat/execute.',
        'Step 4: Move to `review`, complete edits and approvals.',
        'Step 5: Mark `done` and save publish summary in Memory.',
      ],
      ru: [
        'Шаг 1: создайте идею в `ideas` с кратким one-line intent.',
        'Шаг 2: запустите `plan`, чтобы получить структуру и чеклист.',
        'Шаг 3: переведите в `doing`, соберите черновик через chat/execute.',
        'Шаг 4: переведите в `review`, завершите правки и согласования.',
        'Шаг 5: отметьте `done` и сохраните итог публикации в Memory.',
      ],
    },
    highlights: {
      en: [
        'Reusable flow for posts, articles, landing pages, and email.',
        'Card keeps context and decision trace in one place.',
        'Easy to scale across multiple boards.',
        'Automation-friendly once process stabilizes.',
      ],
      ru: [
        'Переиспользуемый поток для постов, статей, лендингов и email.',
        'Карточка хранит контекст и след решений в одном месте.',
        'Легко масштабируется на несколько досок.',
        'Хорошо автоматизируется после стабилизации процесса.',
      ],
    },
    commands: [
      {
        id: 'playbook-content-create',
        title: { en: 'Create content task', ru: 'Создать контент-задачу' },
        description: { en: 'Start point for a new asset.', ru: 'Стартовая точка для нового материала.' },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks \\
  -H 'content-type: application/json' \\
  -d '{"title":"Draft: launch post","boardId":"<board-id>","status":"ideas"}'`,
      },
      {
        id: 'playbook-content-plan',
        title: { en: 'Generate content plan', ru: 'Сгенерировать контент-план' },
        description: { en: 'Creates structure and execution steps.', ru: 'Создает структуру и шаги выполнения.' },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/run \\
  -X POST -H 'content-type: application/json' \\
  -d '{"mode":"plan"}'`,
      },
    ],
  },
  {
    id: 'task-card',
    group: { en: 'Product', ru: 'Продукт' },
    title: { en: 'Task Card Workflow', ru: 'Работа с карточкой задачи' },
    summary: {
      en: 'Task card is the unit of execution: brief, chat, runs, approvals, artifacts.',
      ru: 'Карточка задачи — единица исполнения: brief, chat, runs, approvals, artifacts.',
    },
    intro: {
      en: [
        'Task-level sessions isolate context and improve repeatability.',
        'Use `plan`, `execute`, and `report` modes depending on stage.',
      ],
      ru: [
        'Сессии на уровне задачи изолируют контекст и повышают повторяемость результата.',
        'Используйте режимы `plan`, `execute` и `report` в зависимости от этапа.',
      ],
    },
    highlights: {
      en: [
        'Soft-stop active runs safely.',
        'Checklist can be updated from planning output.',
        'Run history supports transparent reviews.',
        'Summary can be appended to board docs and memory.',
      ],
      ru: [
        'Можно безопасно остановить активный run (soft-stop).',
        'Checklist может обновляться из результата планирования.',
        'История runs поддерживает прозрачный ревью-процесс.',
        'Summary можно дописывать в board docs и memory.',
      ],
    },
    commands: [
      {
        id: 'task-plan',
        title: { en: 'Run planning mode', ru: 'Запустить режим планирования' },
        description: { en: 'Generates structured plan and checklist.', ru: 'Генерирует структурированный план и чеклист.' },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/run \\
  -X POST -H 'content-type: application/json' \\
  -d '{"mode":"plan"}'`,
      },
      {
        id: 'task-chat',
        title: { en: 'Chat inside task context', ru: 'Чат в контексте задачи' },
        description: { en: 'Refine output without losing thread context.', ru: 'Уточняйте результат без потери контекста ветки.' },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/chat \\
  -X POST -H 'content-type: application/json' \\
  -d '{"text":"Refine the plan and add risk mitigation"}'`,
      },
    ],
  },
  {
    id: 'agents-skills-models',
    group: { en: 'Product', ru: 'Продукт' },
    title: { en: 'Agents, Skills, Models', ru: 'Агенты, навыки, модели' },
    summary: {
      en: 'Configure roles and capabilities without adding operational complexity.',
      ru: 'Настраивайте роли и capability без роста операционной сложности.',
    },
    intro: {
      en: [
        'Agent profiles define behavior with role metadata and prompt overrides.',
        'Skills manage capability boundaries, while model providers are managed through OpenClaw gateway integration.',
      ],
      ru: [
        'Профили агентов задают поведение через role metadata и prompt overrides.',
        'Skills управляют границами capability, а model providers управляются через интеграцию с OpenClaw gateway.',
      ],
    },
    highlights: {
      en: [
        'Marketplace install for both agents and skills.',
        'Prompt override stages: system/plan/execute/chat/report.',
        'Capability controls: network/filesystem/external_write/secrets.',
        'OAuth/API-key model provider support.',
      ],
      ru: [
        'Marketplace-установка доступна и для агентов, и для skills.',
        'Этапы prompt override: system/plan/execute/chat/report.',
        'Контроль capability: network/filesystem/external_write/secrets.',
        'Поддержка model providers через OAuth/API-key.',
      ],
    },
    commands: [
      {
        id: 'models-overview',
        title: { en: 'Get model/provider overview', ru: 'Получить обзор моделей и провайдеров' },
        description: { en: 'Snapshot of current OpenClaw model state.', ru: 'Снимок текущего состояния моделей OpenClaw.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/openclaw/models/overview | jq',
      },
    ],
  },
  {
    id: 'automations',
    group: { en: 'Operations', ru: 'Операции' },
    title: { en: 'Automations & Realtime Events', ru: 'Автоматизации и события в реальном времени' },
    summary: { en: 'Automate recurring work and subscribe to state updates.', ru: 'Автоматизируйте повторяющиеся задачи и подписывайтесь на обновления состояния.' },
    intro: {
      en: [
        'Use automations for recurring jobs, reports, and sync tasks.',
        'Use `/events` stream to observe runs/tasks/checklist updates in real time.',
      ],
      ru: [
        'Используйте автоматизации для регулярных задач, отчетов и синхронизаций.',
        'Используйте поток `/events`, чтобы отслеживать обновления runs/tasks/checklist в реальном времени.',
      ],
    },
    highlights: {
      en: [
        'CRUD for `/automations`.',
        'Manual run endpoint for rapid verification.',
        'SSE stream for event-driven integrations.',
        'Useful for bots and operational control loops.',
      ],
      ru: [
        'CRUD для `/automations`.',
        'Manual run endpoint для быстрой проверки.',
        'SSE-поток для event-driven интеграций.',
        'Полезно для ботов и операционных control-loop сценариев.',
      ],
    },
    commands: [
      {
        id: 'automation-run',
        title: { en: 'Run automation manually', ru: 'Запустить automation вручную' },
        description: { en: 'Validate behavior without waiting for schedule.', ru: 'Проверьте поведение без ожидания расписания.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/automations/<automation-id>/run -X POST',
      },
      {
        id: 'events-watch',
        title: { en: 'Watch realtime event stream', ru: 'Смотреть realtime-поток событий' },
        description: { en: 'Live system event feed.', ru: 'Живой поток системных событий.' },
        language: 'bash',
        code: 'curl -N http://127.0.0.1:8787/events',
      },
    ],
  },
  {
    id: 'security-data',
    group: { en: 'Operations', ru: 'Операции' },
    title: { en: 'Data Safety & Security', ru: 'Безопасность данных и защита' },
    summary: { en: 'Keep migrations safe and operations recoverable.', ru: 'Держите миграции безопасными и операции восстановимыми.' },
    intro: {
      en: [
        'The stack uses SQLite with migration discipline and backup routines.',
        'Use copy-and-verify style operations before destructive changes.',
      ],
      ru: [
        'Стек использует SQLite с дисциплиной миграций и процедурами резервного копирования.',
        'Перед разрушительными изменениями используйте подход copy-and-verify.',
      ],
    },
    highlights: {
      en: [
        'Documented backup and restore flow.',
        'Release rollback support.',
        'Auth/session guardrails and origin checks in API.',
        'Dedicated security smoke tests.',
      ],
      ru: [
        'Документированный flow резервного копирования и восстановления.',
        'Поддержка rollback релизов.',
        'Guardrails auth/session и origin-checks в API.',
        'Отдельные security smoke tests.',
      ],
    },
    commands: [
      {
        id: 'backup-list',
        title: { en: 'List backup snapshots', ru: 'Список backup-снимков' },
        description: { en: 'Verify recovery points are available.', ru: 'Проверить, что точки восстановления доступны.' },
        language: 'bash',
        code: 'bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup list',
      },
      {
        id: 'security-tests',
        title: { en: 'Run security smoke tests', ru: 'Запустить security smoke tests' },
        description: { en: 'Checks core auth/session scenarios.', ru: 'Проверяет ключевые сценарии auth/session.' },
        language: 'bash',
        code: 'pnpm test:security',
      },
    ],
    links: [
      {
        label: { en: 'Data Policy', ru: 'Политика данных' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/DATA-POLICY.md',
      },
      {
        label: { en: 'Database Docs', ru: 'Документация по базе данных' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/database.md',
      },
    ],
  },
  {
    id: 'api-reference',
    group: { en: 'Reference', ru: 'Справочник' },
    title: { en: 'API Reference (Practical)', ru: 'API-справочник (практический)' },
    summary: { en: 'Minimal endpoint set for bots, scripts, and external controllers.', ru: 'Минимальный набор endpoint для ботов, скриптов и внешних контроллеров.' },
    intro: {
      en: [
        'Start with boards/tasks/runs/docs endpoints for most integrations.',
        'Add approvals, automations, and model endpoints when workflows mature.',
      ],
      ru: [
        'Для большинства интеграций начинайте с endpoint групп boards/tasks/runs/docs.',
        'Добавляйте approvals, automations и model endpoint по мере зрелости процессов.',
      ],
    },
    highlights: {
      en: [
        'Task session API for isolated execution context.',
        'Checklist/chat API for card-level workflows.',
        'Approval endpoints for controlled actions.',
        'Model/provider endpoints for gateway integration.',
      ],
      ru: [
        'Task session API для изолированного контекста выполнения.',
        'Checklist/chat API для процессов уровня карточки.',
        'Approval endpoint для управляемых действий.',
        'Model/provider endpoint для gateway-интеграции.',
      ],
    },
    commands: [
      {
        id: 'api-approvals',
        title: { en: 'List pending approvals', ru: 'Список pending approvals' },
        description: { en: 'Useful for alerts and human-in-the-loop triage.', ru: 'Полезно для алертов и human-in-the-loop триажа.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/approvals?status=pending | jq',
      },
      {
        id: 'api-approve',
        title: { en: 'Approve request', ru: 'Подтвердить запрос' },
        description: { en: 'Example of explicit decision action.', ru: 'Пример явного действия подтверждения.' },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/approvals/<approval-id>/approve \\
  -X POST -H 'content-type: application/json' \\
  -d '{"decidedBy":"ops","reason":"safe to proceed"}'`,
      },
    ],
    links: [
      {
        label: { en: 'API Server Source', ru: 'Исходник API-сервера' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/skills/dzzenos/api/server.ts',
      },
      {
        label: { en: 'UI Query Contracts', ru: 'Контракты UI-запросов' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/apps/ui/src/api/queries.ts',
      },
    ],
  },
];

function l<T>(value: Localized<T>, locale: Locale): T {
  if (locale === 'ru' && value.ru != null) return value.ru;
  return value.en;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

function sectionSearchText(section: DocsSection, locale: Locale): string {
  return [
    l(section.group, locale),
    l(section.title, locale),
    l(section.summary, locale),
    ...l(section.intro, locale),
    ...l(section.highlights, locale),
    ...(section.commands?.map((c) => `${l(c.title, locale)} ${l(c.description, locale)} ${c.code}`) ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

function sectionMarkdown(section: DocsSection, locale: Locale): string {
  const lines: string[] = [];
  lines.push(`# ${l(section.title, locale)}`);
  lines.push('');
  lines.push(l(section.summary, locale));
  lines.push('');
  for (const p of l(section.intro, locale)) {
    lines.push(p);
    lines.push('');
  }
  lines.push('## Highlights');
  lines.push('');
  for (const item of l(section.highlights, locale)) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  if (section.commands?.length) {
    lines.push('## Commands');
    lines.push('');
    for (const command of section.commands) {
      lines.push(`### ${l(command.title, locale)}`);
      lines.push('');
      lines.push(l(command.description, locale));
      lines.push('');
      lines.push(`\`\`\`${command.language}`);
      lines.push(command.code);
      lines.push('```');
      lines.push('');
    }
  }

  if (section.links?.length) {
    lines.push('## Related Docs');
    lines.push('');
    for (const link of section.links) {
      const note = link.note ? ` — ${l(link.note, locale)}` : '';
      lines.push(`- ${l(link.label, locale)}: ${link.href}${note}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function DocsPage() {
  const [locale, setLocale] = useState<Locale>('en');
  const [query, setQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(DOCS_SECTIONS[0]?.id ?? '');
  const [feedbackByBlock, setFeedbackByBlock] = useState<Record<string, string>>({});

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCS_SECTIONS;
    return DOCS_SECTIONS.filter((section) => sectionSearchText(section, locale).includes(q));
  }, [query, locale]);

  useEffect(() => {
    if (filteredSections.length === 0) return;
    if (!filteredSections.some((s) => s.id === activeSectionId)) {
      setActiveSectionId(filteredSections[0].id);
    }
  }, [filteredSections, activeSectionId]);

  const activeSection = useMemo(
    () => filteredSections.find((section) => section.id === activeSectionId) ?? filteredSections[0] ?? null,
    [filteredSections, activeSectionId],
  );

  const groupedSections = useMemo(() => {
    const groups = new Map<string, DocsSection[]>();
    for (const section of filteredSections) {
      const groupName = l(section.group, locale);
      const list = groups.get(groupName) ?? [];
      list.push(section);
      groups.set(groupName, list);
    }
    return Array.from(groups.entries());
  }, [filteredSections, locale]);

  const [pageFeedback, setPageFeedback] = useState('');

  const setCodeFeedback = (id: string, value: string) => {
    setFeedbackByBlock((prev) => ({ ...prev, [id]: value }));
    window.setTimeout(() => {
      setFeedbackByBlock((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 1800);
  };

  const setPageActionFeedback = (value: string) => {
    setPageFeedback(value);
    window.setTimeout(() => setPageFeedback(''), 1800);
  };

  const onCopyCode = async (command: DocsCommand) => {
    const ok = await copyText(command.code);
    setCodeFeedback(command.id, ok ? l(UI_COPY.copied, locale) : l(UI_COPY.copyFailed, locale));
  };

  const onCopyPage = async () => {
    if (!activeSection) return;
    const payload = sectionMarkdown(activeSection, locale);
    const ok = await copyText(payload);
    setPageActionFeedback(ok ? l(UI_COPY.copied, locale) : l(UI_COPY.copyFailed, locale));
  };

  const onOpenPageInAssistant = async (target: AssistantTarget) => {
    if (!activeSection) return;
    const payload = sectionMarkdown(activeSection, locale);
    await copyText(payload);
    const deepLink = AI_TARGETS[target].toUrl(payload);
    window.open(deepLink, '_blank', 'noopener,noreferrer');
    setPageActionFeedback(`${l(UI_COPY.triedOpen, locale)} ${AI_TARGETS[target].label}`);
  };

  return (
    <div className="flex w-full flex-col gap-5 text-slate-100">
      <PageHeader
        title="Docs"
        subtitle={l(UI_COPY.pageSubtitle, locale)}
        actions={
          <div className="flex items-center gap-2 rounded-md bg-slate-900/65 px-2 py-1">
            <span className="text-xs text-slate-400">{l(UI_COPY.language, locale)}</span>
            <button
              type="button"
              onClick={() => setLocale('en')}
              className={cn(
                'rounded px-2 py-1 text-xs transition',
                locale === 'en' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-slate-100',
              )}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLocale('ru')}
              className={cn(
                'rounded px-2 py-1 text-xs transition',
                locale === 'ru' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:text-slate-100',
              )}
            >
              RU
            </button>
          </div>
        }
      />

      <div className="border-b border-slate-800/80 pb-3">
        <p className="text-sm text-slate-300">{l(UI_COPY.platformLead, locale)}</p>
        {locale === 'ru' ? <p className="mt-1 text-xs text-slate-400">{l(UI_COPY.translationNote, locale)}</p> : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[240px,minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100dvh-4rem)] lg:overflow-auto">
          <div className="mb-3">
            <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{l(UI_COPY.searchLabel, locale)}</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={l(UI_COPY.searchPlaceholder, locale)}
              className="h-9 w-full rounded-md border border-slate-800 bg-slate-950/60 px-3 text-sm text-slate-200 outline-none focus-visible:border-sky-500/50"
            />
          </div>

          <nav className="space-y-4">
            {groupedSections.map(([group, sections]) => (
              <div key={group}>
                <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">{group}</div>
                <div className="space-y-1">
                  {sections.map((section) => {
                    const active = section.id === activeSection?.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSectionId(section.id)}
                        className={cn(
                          'w-full border-l-2 px-3 py-1.5 text-left text-sm transition',
                          active
                            ? 'border-sky-400 text-slate-100'
                            : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200',
                        )}
                      >
                        {l(section.title, locale)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredSections.length === 0 ? <div className="text-xs text-slate-500">{l(UI_COPY.noResults, locale)}</div> : null}
          </nav>
        </aside>

        <section className="min-w-0">
          {!activeSection ? (
            <div className="text-sm text-slate-400">{l(UI_COPY.selectSection, locale)}</div>
          ) : (
            <article>
              <header className="border-b border-slate-800/80 pb-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">{l(activeSection.group, locale)}</div>
                <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-3xl font-semibold tracking-tight text-slate-50 font-display">{l(activeSection.title, locale)}</h2>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="secondary" onClick={onCopyPage}>
                      {l(UI_COPY.copyPage, locale)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onOpenPageInAssistant('cursor')}>
                      {l(UI_COPY.cursor, locale)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onOpenPageInAssistant('codex')}>
                      {l(UI_COPY.codex, locale)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onOpenPageInAssistant('claude')}>
                      {l(UI_COPY.claude, locale)}
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-300">{l(activeSection.summary, locale)}</p>
                <p className="mt-1 text-[11px] text-slate-500">{pageFeedback || l(UI_COPY.pageActionHint, locale)}</p>
              </header>

              <div className="mt-5 space-y-3">
                {l(activeSection.intro, locale).map((paragraph, idx) => (
                  <p key={`${activeSection.id}-intro-${idx}`} className="text-sm leading-relaxed text-slate-200">
                    {paragraph}
                  </p>
                ))}
              </div>

              <ul className="mt-5 space-y-2">
                {l(activeSection.highlights, locale).map((highlight, idx) => (
                  <li key={`${activeSection.id}-hl-${idx}`} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>

              {activeSection.commands?.length ? (
                <div className="mt-8 space-y-6">
                  {activeSection.commands.map((command) => (
                    <section key={command.id} className="border-t border-slate-800/80 pt-4">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-medium text-slate-100">{l(command.title, locale)}</h3>
                          <p className="mt-1 text-sm text-slate-400">{l(command.description, locale)}</p>
                        </div>
                        <button
                          type="button"
                          title={l(UI_COPY.copyCode, locale)}
                          aria-label={l(UI_COPY.copyCode, locale)}
                          onClick={() => onCopyCode(command)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700 bg-slate-900/70 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-3.5 w-3.5">
                            <rect x="7" y="7" width="9" height="9" rx="1.5" />
                            <path d="M4.5 12.5h-1A1.5 1.5 0 0 1 2 11V3.5A1.5 1.5 0 0 1 3.5 2h7.5A1.5 1.5 0 0 1 12.5 3.5v1" />
                          </svg>
                        </button>
                      </div>
                      <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs leading-relaxed text-slate-100">
                        <code>{command.code}</code>
                      </pre>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {feedbackByBlock[command.id] ?? l(UI_COPY.copyCode, locale)}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}

              {activeSection.links?.length ? (
                <div className="mt-8 border-t border-slate-800/80 pt-4">
                  <h3 className="text-sm font-medium text-slate-100">{l(UI_COPY.relatedDocs, locale)}</h3>
                  <ul className="mt-2 space-y-2">
                    {activeSection.links.map((link) => (
                      <li key={link.href}>
                        <a href={link.href} target="_blank" rel="noreferrer" className="text-sm text-sky-300 hover:text-sky-200">
                          {l(link.label, locale)}
                        </a>
                        {link.note ? <span className="ml-2 text-xs text-slate-500">{l(link.note, locale)}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
