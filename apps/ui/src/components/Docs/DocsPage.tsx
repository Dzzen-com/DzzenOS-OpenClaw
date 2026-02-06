import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../Layout/PageHeader';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';

type DocsCommand = {
  id: string;
  title: string;
  description: string;
  language: 'bash' | 'http' | 'json';
  code: string;
  assistantPrompt?: string;
};

type DocsLink = {
  label: string;
  href: string;
  note?: string;
};

type DocsSection = {
  id: string;
  group: string;
  title: string;
  summary: string;
  intro: string[];
  highlights: string[];
  commands?: DocsCommand[];
  links?: DocsLink[];
};

type AssistantTarget = 'cursor' | 'codex' | 'claude';

const AI_TARGETS: Record<AssistantTarget, { label: string; toUrl: (text: string) => string }> = {
  cursor: {
    label: 'Open in Cursor',
    toUrl: (text) => `cursor://anysphere.cursor-deeplink/new?prompt=${encodeURIComponent(text)}`,
  },
  codex: {
    label: 'Open in Codex',
    toUrl: (text) => `codex://new?prompt=${encodeURIComponent(text)}`,
  },
  claude: {
    label: 'Open in Claude',
    toUrl: (text) => `claude://new?prompt=${encodeURIComponent(text)}`,
  },
};

const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'start-5-min',
    group: 'Start Here',
    title: 'Старт за 5 минут',
    summary: 'Что это, где запускать и как быстро зайти в рабочий поток.',
    intro: [
      'DzzenOS работает нативно внутри OpenClaw: это не отдельный SaaS и не отдельная экосистема. Вы управляете задачами, агентами и автоматизациями в одном месте.',
      'Если кратко: создаете board, добавляете задачу, запускаете агента, получаете результат и фиксируете контекст в Memory.',
    ],
    highlights: [
      'Единый интерфейс для Founder Ops и Content.',
      'Локальные данные: SQLite + локальные docs.',
      'Нативная связка с OpenClaw моделями/агентами.',
      'Docs = документация платформы, Memory = память вашего проекта.',
    ],
    commands: [
      {
        id: 'start-local',
        title: 'Локальный запуск (разработка)',
        description: 'Поднимает UI и API для работы на локальной машине.',
        language: 'bash',
        code: `pnpm install\npnpm dev`,
      },
      {
        id: 'start-api',
        title: 'Проверка API после запуска',
        description: 'Быстрый smoke test до открытия UI.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/boards | jq',
      },
    ],
    links: [
      {
        label: 'README',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/README.md',
        note: 'Базовый обзор продукта и сценариев.',
      },
      {
        label: 'Install Guide',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/INSTALL.md',
      },
    ],
  },
  {
    id: 'install-access',
    group: 'Start Here',
    title: 'Установка и доступ',
    summary: 'Серверный install, домен с TLS и rollback без боли.',
    intro: [
      'Для рабочей эксплуатации используйте release-first установку на сервер. Для удобного доступа с телефона/ноутбука включайте domain mode.',
      'Если релиз не подошел, откат выполняется одной командой и не ломает общий процесс эксплуатации.',
    ],
    highlights: [
      'Установка последнего релиза одной командой.',
      'Можно фиксировать конкретную версию.',
      'Domain mode: HTTPS + login + безопасный удаленный доступ.',
      'Rollback к предыдущему snapshot.',
    ],
    commands: [
      {
        id: 'install-release',
        title: 'Установить/обновить релиз',
        description: 'Основная команда для сервера.',
        language: 'bash',
        code: 'curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash',
      },
      {
        id: 'install-version-pin',
        title: 'Поставить конкретную версию',
        description: 'Подходит для стабильного release management.',
        language: 'bash',
        code: 'curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --version v1.2.3',
      },
      {
        id: 'install-rollback',
        title: 'Откатить предыдущую версию',
        description: 'Быстрое восстановление при проблемном апдейте.',
        language: 'bash',
        code: 'curl -fsSL https://raw.githubusercontent.com/Dzzen-com/DzzenOS-OpenClaw/main/scripts/install.sh | bash -s -- --rollback',
      },
    ],
    links: [
      {
        label: 'Install Modes',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/INSTALL-MODES.md',
      },
      {
        label: 'Domain Access',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/DOMAIN-ACCESS.md',
      },
      {
        label: 'Agent-driven Install',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/AGENT-INSTALL.md',
      },
    ],
  },
  {
    id: 'playbook-weekly-review',
    group: 'Playbooks',
    title: 'Playbook: Weekly Review за 3 шага',
    summary: 'Быстрый ритуал для еженедельного контроля задач, рисков и планов.',
    intro: [
      'Шаг 1: откройте Dashboard и посмотрите failed/stuck runs и pending approvals. Это даст список срочных блокеров.',
      'Шаг 2: по ключевым задачам запустите plan/report, доуточните через chat и зафиксируйте статус в Kanban.',
      'Шаг 3: добавьте итог недели в Memory через board summary, чтобы следующий цикл начинался с актуального контекста.',
    ],
    highlights: [
      'Время выполнения: 15-25 минут.',
      'Фокус: риски, блокеры, решения на следующую неделю.',
      'Итог фиксируется в board docs/changelog/memory.',
      'Подходит для соло-фаундера и маленькой команды.',
    ],
    commands: [
      {
        id: 'playbook-weekly-summary',
        title: 'Записать weekly summary в Memory',
        description: 'Закрывает weekly review и сохраняет историю решений.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/docs/boards/<board-id>/summary \\
  -X POST -H 'content-type: application/json' \\
  -d '{"title":"Weekly review","summary":"- Закрыли блокеры\\n- Определили цели на неделю\\n- Обновили приоритеты"}'`,
      },
    ],
  },
  {
    id: 'playbook-content-pipeline',
    group: 'Playbooks',
    title: 'Playbook: Контент-пайплайн за 5 шагов',
    summary: 'От идеи до публикации с прозрачным статусом и агентной поддержкой.',
    intro: [
      'Шаг 1: добавьте идею в `ideas` с кратким one-liner описанием.',
      'Шаг 2: запустите plan, чтобы получить структуру материала и чеклист.',
      'Шаг 3: переведите задачу в `doing`, отработайте черновик через chat/execute.',
      'Шаг 4: отправьте в `review`, пройдите правки и финальные согласования.',
      'Шаг 5: после публикации переведите в `done` и сохраните summary в Memory.',
    ],
    highlights: [
      'Единый путь для постов, статей, лендингов и email-рассылок.',
      'Карточка задачи хранит контекст и историю решений.',
      'Можно масштабировать на несколько контент-треков в разных boards.',
      'Пайплайн легко автоматизировать через Automations.',
    ],
    commands: [
      {
        id: 'playbook-content-create',
        title: 'Создать контент-задачу',
        description: 'Стартовая точка для нового материала.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks \\
  -H 'content-type: application/json' \\
  -d '{"title":"Draft: launch post","boardId":"<board-id>","status":"ideas"}'`,
      },
      {
        id: 'playbook-content-plan',
        title: 'Сгенерировать план контента',
        description: 'Получить структуру и шаги выполнения.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/run \\
  -X POST -H 'content-type: application/json' \\
  -d '{"mode":"plan"}'`,
      },
    ],
  },
  {
    id: 'daily-flow',
    group: 'Product',
    title: 'Ежедневный цикл работы',
    summary: 'Простой operational-поток: идея -> задача -> запуск -> проверка -> done.',
    intro: [
      'Открывайте Kanban как главный рабочий экран. Добавляйте задачи в Ideas, переводите в To do и запускайте работу в Doing/Review.',
      'Dashboard показывает, где нужна реакция: зависшие ранны, ошибки, pending approvals. Это позволяет держать темп без ручного мониторинга.',
    ],
    highlights: [
      'Единый статусовый поток: ideas -> todo -> doing -> review -> release -> done -> archived.',
      'Быстрый capture задач без модалок.',
      'Multi-select и bulk-действия в канбане.',
      'Realtime обновления статусов через SSE.',
    ],
    commands: [
      {
        id: 'daily-create-task',
        title: 'Создать задачу через API',
        description: 'Подходит для внешних интеграций и операторских сценариев.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks \\
  -H 'content-type: application/json' \\
  -d '{"title":"Подготовить weekly review","boardId":"<board-id>","status":"ideas"}'`,
      },
      {
        id: 'daily-move-task',
        title: 'Перевести задачу в работу',
        description: 'Классический шаг из backlog в execution.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id> \\
  -X PATCH -H 'content-type: application/json' \\
  -d '{"status":"doing"}'`,
      },
    ],
  },
  {
    id: 'task-card',
    group: 'Product',
    title: 'Карточка задачи: как пользоваться',
    summary: 'Карточка = brief + чат + run history + approvals + артефакты.',
    intro: [
      'В DzzenOS главная единица работы - карточка задачи. Внутри нее вы держите контекст, общаетесь с агентом и видите историю выполнения.',
      'Сессия агента изолирована по задаче: это снижает шум, улучшает повторяемость и делает итоговые отчеты понятнее.',
    ],
    highlights: [
      'Modes: plan, execute, report.',
      'Можно мягко остановить активный run.',
      'Checklist обновляется из результата планирования.',
      'При завершении можно писать summary в board docs/changelog/memory.',
    ],
    commands: [
      {
        id: 'task-plan',
        title: 'Запустить планирование',
        description: 'Генерирует структурированный план и чеклист.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/run \\
  -X POST -H 'content-type: application/json' \\
  -d '{"mode":"plan"}'`,
      },
      {
        id: 'task-chat',
        title: 'Написать агенту в контексте задачи',
        description: 'Уточняет план или просит доработать результат.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/chat \\
  -X POST -H 'content-type: application/json' \\
  -d '{"text":"Уточни риски и дай план mitigation"}'`,
      },
      {
        id: 'task-stop',
        title: 'Остановить активный run',
        description: 'Soft cancel для безопасного прерывания исполнения.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/tasks/<task-id>/stop -X POST',
      },
    ],
  },
  {
    id: 'agents-skills-models',
    group: 'Product',
    title: 'Agents, Skills, Models без лишней сложности',
    summary: 'Настраиваете роли агентов и capabilities, а запуск остается простым.',
    intro: [
      'Agent Library хранит профили агентов, их роли, теги и prompt overrides по этапам plan/execute/chat/report. Это позволяет адаптировать поведение без копипасты промптов.',
      'Skills задают разрешения (network/filesystem/external_write/secrets), а Models связываются с OpenClaw gateway и вашими провайдерами.',
    ],
    highlights: [
      'Marketplace install для агентов и skills.',
      'Профили агентов подключаются к задачам без ручного glue-кода.',
      'OAuth/API key поддерживаются для model providers.',
      'OpenClaw интеграции работают нативно через backend шлюз.',
    ],
    commands: [
      {
        id: 'models-overview',
        title: 'Проверить providers/models overview',
        description: 'Снимок текущего состояния моделей OpenClaw.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/openclaw/models/overview | jq',
      },
      {
        id: 'models-scan',
        title: 'Пересканировать модели',
        description: 'Обновляет перечень доступных моделей.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/openclaw/models/scan \\
  -X POST -H 'content-type: application/json' \\
  -d '{}'`,
      },
      {
        id: 'skills-list',
        title: 'Посмотреть включенные skills',
        description: 'Удобно для аудита доступа и troubleshooting.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/skills | jq',
      },
    ],
    links: [
      {
        label: 'OpenClaw Integrations',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/openclaw-native/OPENCLAW-INTEGRATIONS.md',
      },
    ],
  },
  {
    id: 'memory',
    group: 'Product',
    title: 'Memory: память проекта',
    summary: 'Храните рабочий контекст отдельно от продуктовой документации.',
    intro: [
      'Страница Memory предназначена для живого контекста: overview workspace, board notes и changelog. Это ваш операционный слой знаний.',
      'Docs служит как справочник по платформе и best-practices. Разделение важно, чтобы не смешивать документацию продукта с текущими рабочими заметками.',
    ],
    highlights: [
      'Workspace overview и board docs в одном месте.',
      'Changelog для фиксации принятых изменений.',
      'Поддержка summary append после завершения задач.',
      'Логичное разделение: Memory для работы, Docs для обучения.',
    ],
    commands: [
      {
        id: 'memory-summary-append',
        title: 'Добавить итог в board memory',
        description: 'Полезно после weekly review или релиза.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/docs/boards/<board-id>/summary \\
  -X POST -H 'content-type: application/json' \\
  -d '{"title":"Weekly review","summary":"- Закрыли критические блокеры\\n- Обновили план спринта"}'`,
      },
    ],
  },
  {
    id: 'automations',
    group: 'Operations',
    title: 'Automations и realtime события',
    summary: 'Автоматизируйте повторяющиеся задачи и отслеживайте изменения в реальном времени.',
    intro: [
      'Автоматизации нужны для рутины: регулярные отчеты, синхронизации, проверки статусов. Они запускаются вручную и по расписанию.',
      'Endpoint `/events` позволяет слушать изменения runs/tasks/checklist и строить реактивные интеграции.',
    ],
    highlights: [
      'CRUD для `/automations`.',
      'Manual run для проверки сценария.',
      'SSE-поток для live состояния системы.',
      'Полезно для ботов и внешних контроллеров.',
    ],
    commands: [
      {
        id: 'automation-list',
        title: 'Получить список automation',
        description: 'Проверить конфигурацию перед запуском.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/automations | jq',
      },
      {
        id: 'automation-run',
        title: 'Запустить automation вручную',
        description: 'Ускоренная проверка результата без ожидания расписания.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/automations/<automation-id>/run -X POST',
      },
      {
        id: 'events-watch',
        title: 'Подписка на realtime поток',
        description: 'Непрерывный просмотр событий системы.',
        language: 'bash',
        code: 'curl -N http://127.0.0.1:8787/events',
      },
    ],
  },
  {
    id: 'security-data',
    group: 'Operations',
    title: 'Данные и безопасность',
    summary: 'Как хранить данные безопасно и восстанавливаться без потерь.',
    intro: [
      'Система использует SQLite с миграциями. Для апдейтов и изменений схемы зафиксированы правила безопасного copy-and-verify подхода.',
      'Перед значимыми изменениями делайте backup. Это основа надежной local-first эксплуатации в production.',
    ],
    highlights: [
      'Документированная политика Data Safety.',
      'Backup/restore и release rollback процедуры.',
      'Auth/session guardrails и origin checks в API.',
      'Security tests вынесены в отдельный пакет.',
    ],
    commands: [
      {
        id: 'backup-list',
        title: 'Проверить список backup',
        description: 'Убедиться, что есть свежие точки восстановления.',
        language: 'bash',
        code: 'bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup list',
      },
      {
        id: 'security-tests',
        title: 'Запустить security smoke tests',
        description: 'Проверка ключевых auth/session сценариев.',
        language: 'bash',
        code: 'pnpm test:security',
      },
    ],
    links: [
      {
        label: 'Data Policy',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/DATA-POLICY.md',
      },
      {
        label: 'Database docs',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/database.md',
      },
      {
        label: 'Release Operations',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/RELEASE-OPERATIONS.md',
      },
    ],
  },
  {
    id: 'api-reference',
    group: 'Operations',
    title: 'API для интеграций',
    summary: 'Минимальный набор endpoint для ботов, скриптов и внешних панелей.',
    intro: [
      'Если нужно интегрировать DzzenOS с внешними инструментами, начинайте с boards/tasks/runs и docs endpoints. Этого хватает для большинства автоматизированных сценариев.',
      'Для расширенных кейсов доступны approvals, agents/skills, automations и модельные endpoint OpenClaw.',
    ],
    highlights: [
      'Task session API (`/tasks/:id/session`).',
      'Checklist и chat API для card-level операций.',
      'Approvals API для управляемых действий.',
      'OpenClaw model management endpoint.',
    ],
    commands: [
      {
        id: 'api-task-runs',
        title: 'История запусков задачи',
        description: 'Дает runs и шаги для отчетов/дашбордов.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/tasks/<task-id>/runs | jq',
      },
      {
        id: 'api-approvals',
        title: 'Список pending approvals',
        description: 'Точка для оповещений и triage процессов.',
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/approvals?status=pending | jq',
      },
      {
        id: 'api-approve',
        title: 'Подтвердить approval',
        description: 'Пример явного решения по запросу агента.',
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/approvals/<approval-id>/approve \\
  -X POST -H 'content-type: application/json' \\
  -d '{"decidedBy":"ops","reason":"safe to proceed"}'`,
      },
    ],
    links: [
      {
        label: 'API server source',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/skills/dzzenos/api/server.ts',
      },
      {
        label: 'UI query contracts',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/apps/ui/src/api/queries.ts',
      },
    ],
  },
  {
    id: 'docs-workflow',
    group: 'Contributing',
    title: 'Как обновлять эту документацию',
    summary: 'Правило: новая функция = обновление UI текста + Docs + примера использования.',
    intro: [
      'После каждой новой функции обновляйте эту страницу так, чтобы пользователь сразу понял: что это, зачем нужно, и как включить.',
      'Не ограничивайтесь описанием endpoint. Добавляйте практический сценарий и минимальный рабочий пример команды.',
    ],
    highlights: [
      'Пишите простым языком, без внутреннего жаргона.',
      'Если меняется user flow, обновляйте разделы Start Here и Daily Flow.',
      'Если меняется API поведение, синхронизируйте примеры команд.',
      'Держите Docs и Memory раздельно по назначению.',
    ],
    commands: [
      {
        id: 'docs-update-prompt',
        title: 'Шаблон запроса на обновление docs',
        description: 'Можно отправлять в Codex/Cursor/Claude.',
        language: 'bash',
        code: `Обнови документацию под новую функцию:\n1) Обнови /apps/ui/src/components/Docs/DocsPage.tsx\n2) Сверь контракты в /apps/ui/src/api/queries.ts и /skills/dzzenos/api/server.ts\n3) Обнови соответствующий файл в /Docs\n4) Перепроверь пользовательский текст: что делает функция, как включить, как проверить\n5) Запусти pnpm -C apps/ui lint && pnpm -C apps/ui build`,
        assistantPrompt: `Обнови документацию под новую функцию:\n1) Обнови /apps/ui/src/components/Docs/DocsPage.tsx\n2) Сверь контракты в /apps/ui/src/api/queries.ts и /skills/dzzenos/api/server.ts\n3) Обнови соответствующий файл в /Docs\n4) Перепроверь пользовательский текст: что делает функция, как включить, как проверить\n5) Запусти pnpm -C apps/ui lint && pnpm -C apps/ui build`,
      },
    ],
    links: [
      {
        label: 'Docs Index',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/README.md',
      },
      {
        label: 'Contributing',
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/CONTRIBUTING.md',
      },
    ],
  },
];

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

function sectionSearchText(section: DocsSection): string {
  return [
    section.group,
    section.title,
    section.summary,
    ...section.intro,
    ...section.highlights,
    ...(section.commands?.map((c) => `${c.title} ${c.description} ${c.code}`) ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

export function DocsPage() {
  const [query, setQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(DOCS_SECTIONS[0]?.id ?? '');
  const [feedbackByBlock, setFeedbackByBlock] = useState<Record<string, string>>({});

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOCS_SECTIONS;
    return DOCS_SECTIONS.filter((section) => sectionSearchText(section).includes(q));
  }, [query]);

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
      const list = groups.get(section.group) ?? [];
      list.push(section);
      groups.set(section.group, list);
    }
    return Array.from(groups.entries());
  }, [filteredSections]);

  const setFeedback = (id: string, value: string) => {
    setFeedbackByBlock((prev) => ({ ...prev, [id]: value }));
    window.setTimeout(() => {
      setFeedbackByBlock((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 2200);
  };

  const onCopyBlock = async (command: DocsCommand) => {
    const ok = await copyText(command.code);
    setFeedback(command.id, ok ? 'Copied' : 'Copy failed');
  };

  const onOpenInAssistant = async (command: DocsCommand, target: AssistantTarget) => {
    const payload = command.assistantPrompt?.trim() ? command.assistantPrompt.trim() : command.code;
    await copyText(payload);

    const deepLink = AI_TARGETS[target].toUrl(payload);
    window.open(deepLink, '_blank', 'noopener,noreferrer');
    setFeedback(command.id, `Copied + tried ${AI_TARGETS[target].label}`);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="Docs" subtitle="GitBook-style docs for DzzenOS platform (native inside OpenClaw)." />

      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-surface-2/70 via-surface-1/80 to-surface-1/60 p-4 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Platform Docs</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Архитектура, возможности, API, install и ops-практики. Редактор контекста проекта теперь вынесен на страницу <span className="text-foreground">Memory</span>.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <BadgePill label={`${DOCS_SECTIONS.length} sections`} />
            <BadgePill label="Local-first" />
            <BadgePill label="OpenClaw-native" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px,minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100dvh-4rem)] lg:overflow-auto">
          <div className="rounded-2xl border border-border/70 bg-surface-1/75 p-3 shadow-panel backdrop-blur">
            <label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Search docs</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="API, install, security, memory..."
              className="h-9 w-full rounded-md border border-input/70 bg-background/35 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />

            <div className="mt-3 grid gap-3">
              {groupedSections.map(([group, sections]) => (
                <div key={group}>
                  <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{group}</div>
                  <div className="flex flex-col gap-1">
                    {sections.map((section) => {
                      const active = section.id === activeSection?.id;
                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setActiveSectionId(section.id)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-left transition',
                            active
                              ? 'border-primary/45 bg-primary/10 text-foreground'
                              : 'border-border/50 bg-surface-2/35 text-muted-foreground hover:border-border hover:bg-surface-2/60 hover:text-foreground',
                          )}
                        >
                          <div className="text-xs font-medium">{section.title}</div>
                          <div className="mt-1 line-clamp-2 text-[11px] opacity-80">{section.summary}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {filteredSections.length === 0 ? (
                <div className="rounded-lg border border-border/70 bg-surface-2/30 p-3 text-xs text-muted-foreground">
                  Ничего не найдено по текущему запросу.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-border/70 bg-surface-1/75 shadow-panel backdrop-blur">
          {!activeSection ? (
            <div className="p-6 text-sm text-muted-foreground">Выберите раздел в навигации слева.</div>
          ) : (
            <div className="p-5 sm:p-6">
              <div className="mb-5 border-b border-border/70 pb-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{activeSection.group}</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground font-display">{activeSection.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{activeSection.summary}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {activeSection.highlights.map((highlight, idx) => (
                  <div key={`${activeSection.id}-hl-${idx}`} className="rounded-lg border border-border/70 bg-surface-2/35 p-3">
                    <div className="text-xs text-foreground">{highlight}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-3">
                {activeSection.intro.map((paragraph, idx) => (
                  <p key={`${activeSection.id}-intro-${idx}`} className="text-sm leading-relaxed text-foreground/95">
                    {paragraph}
                  </p>
                ))}
              </div>

              {activeSection.commands?.length ? (
                <div className="mt-6 grid gap-4">
                  {activeSection.commands.map((command) => (
                    <article key={command.id} className="overflow-hidden rounded-xl border border-border/70 bg-background/35">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">{command.title}</h3>
                          <p className="mt-1 text-xs text-muted-foreground">{command.description}</p>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="secondary" onClick={() => onCopyBlock(command)}>
                            Copy
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onOpenInAssistant(command, 'cursor')}>
                            Cursor
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onOpenInAssistant(command, 'codex')}>
                            Codex
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onOpenInAssistant(command, 'claude')}>
                            Claude
                          </Button>
                        </div>
                      </div>

                      <div className="border-b border-border/70 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {command.language}
                      </div>
                      <pre className="m-0 overflow-x-auto px-4 py-4 text-xs leading-relaxed text-foreground">
                        <code>{command.code}</code>
                      </pre>

                      <div className="px-4 py-2 text-[11px] text-muted-foreground">
                        {feedbackByBlock[command.id] ?? 'Tip: кнопки AI сначала копируют текст, затем пробуют открыть deep-link.'}
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {activeSection.links?.length ? (
                <div className="mt-6 rounded-xl border border-border/70 bg-surface-2/25 p-4">
                  <div className="text-sm font-semibold text-foreground">Related docs</div>
                  <div className="mt-3 grid gap-2">
                    {activeSection.links.map((link) => (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-border/60 bg-surface-1/50 px-3 py-2 text-sm text-primary transition hover:border-primary/40 hover:bg-surface-1"
                      >
                        <span className="font-medium">{link.label}</span>
                        {link.note ? <span className="ml-2 text-xs text-muted-foreground">{link.note}</span> : null}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function BadgePill({ label }: { label: string }) {
  return <span className="rounded-full border border-border/70 bg-surface-2/40 px-2.5 py-1 text-[11px]">{label}</span>;
}
