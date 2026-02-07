import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../Layout/PageHeader';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import { useTranslation } from 'react-i18next';

type Locale = 'en' | 'ru';

type Localized<T> = {
  en: T;
  ru: T;
};

type DocsCommand = {
  id: string;
  title: Localized<string>;
  description: Localized<string>;
  language: 'bash' | 'http' | 'json';
  code: string;
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
  platformLead: Localized<string>;
  searchLabel: Localized<string>;
  searchPlaceholder: Localized<string>;
  noResults: Localized<string>;
  selectSection: Localized<string>;
  relatedDocs: Localized<string>;
  copyPage: Localized<string>;
  copyCode: Localized<string>;
  cursor: Localized<string>;
  codex: Localized<string>;
  claude: Localized<string>;
  copied: Localized<string>;
  copyFailed: Localized<string>;
  triedOpen: Localized<string>;
  language: Localized<string>;
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
    en: 'User documentation for DzzenOS running natively inside OpenClaw.',
    ru: 'Пользовательская документация DzzenOS, работающего нативно внутри OpenClaw.',
  },
  platformLead: {
    en: 'This in-product documentation is available to installed users. It explains how to use every current platform section end-to-end.',
    ru: 'Эта встроенная документация доступна пользователям установленной платформы. Здесь подробно описано, как использовать все текущие разделы.',
  },
  searchLabel: { en: 'Search', ru: 'Поиск' },
  searchPlaceholder: {
    en: 'Search sections, workflows, actions, commands...',
    ru: 'Поиск по разделам, сценариям, действиям, командам...',
  },
  noResults: {
    en: 'No sections found for this query.',
    ru: 'По этому запросу разделы не найдены.',
  },
  selectSection: {
    en: 'Select a section from the left navigation.',
    ru: 'Выберите раздел в левой навигации.',
  },
  relatedDocs: { en: 'Related Docs', ru: 'Связанные документы' },
  copyPage: { en: 'Copy Page', ru: 'Копировать страницу' },
  copyCode: { en: 'Copy code', ru: 'Копировать код' },
  cursor: { en: 'Cursor', ru: 'Cursor' },
  codex: { en: 'Codex', ru: 'Codex' },
  claude: { en: 'Claude', ru: 'Claude' },
  copied: { en: 'Copied', ru: 'Скопировано' },
  copyFailed: { en: 'Copy failed', ru: 'Ошибка копирования' },
  triedOpen: { en: 'Copied and tried opening in', ru: 'Скопировано и попытка открыть в' },
  language: { en: 'Language', ru: 'Язык' },
  pageActionHint: {
    en: 'Page actions apply to the current section.',
    ru: 'Действия страницы применяются к текущему разделу.',
  },
};

const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'overview',
    group: { en: 'Getting Started', ru: 'Начало работы' },
    title: { en: 'What DzzenOS Is', ru: 'Что такое DzzenOS' },
    summary: {
      en: 'A local-first operating layer for execution, running natively with OpenClaw.',
      ru: 'Local-first операционный слой для исполнения задач, работающий нативно с OpenClaw.',
    },
    intro: {
      en: [
        'DzzenOS is not a separate SaaS control plane. It extends your OpenClaw setup with a focused operating workflow: boards, tasks, agent runs, automations, models, skills, and memory.',
        'The core user loop is simple: capture work in Kanban, run agent-assisted execution in task cards, monitor risk in Dashboard, and keep durable context in Memory.',
        'This documentation is part of the installed platform. It is designed for daily usage, not only for developers.',
      ],
      ru: [
        'DzzenOS не является отдельной SaaS-панелью. Он расширяет ваш OpenClaw рабочим контуром: доски, задачи, agent runs, автоматизации, модели, skills и memory.',
        'Базовый пользовательский цикл простой: фиксируете работу в Kanban, выполняете задачи через агента в карточке, контролируете риски в Dashboard и сохраняете контекст в Memory.',
        'Эта документация встроена в установленную платформу и предназначена для ежедневной работы, а не только для разработки.',
      ],
    },
    highlights: {
      en: [
        'Runs on your infrastructure with local-first storage.',
        'Task card is the execution center (brief, chat, runs, approvals).',
        'Designed for founder operations and content operations.',
        'Docs and Memory are intentionally separated by purpose.',
      ],
      ru: [
        'Работает на вашей инфраструктуре с local-first хранением.',
        'Карточка задачи — центр исполнения (brief, chat, runs, approvals).',
        'Подходит для founder operations и content operations.',
        'Docs и Memory намеренно разделены по назначению.',
      ],
    },
    commands: [
      {
        id: 'overview-smoke',
        title: { en: 'Check API is alive', ru: 'Проверить, что API доступен' },
        description: {
          en: 'Use this quick smoke test before troubleshooting UI behavior.',
          ru: 'Используйте эту быструю проверку перед разбором проблем UI.',
        },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/boards | jq',
      },
    ],
  },
  {
    id: 'navigation',
    group: { en: 'Getting Started', ru: 'Начало работы' },
    title: { en: 'Navigation and Access', ru: 'Навигация и доступ' },
    summary: {
      en: 'How to move through the platform and what each top-level section is for.',
      ru: 'Как перемещаться по платформе и для чего предназначен каждый основной раздел.',
    },
    intro: {
      en: [
        'Sidebar is the main navigation: Dashboard, Agents, Workspace (Projects tree), Docs, and Settings. Mobile uses compact bottom navigation.',
        'Project memory is isolated inside each project branch in the Workspace tree. Keep Docs as the canonical product manual.',
        'OpenClaw UI remains available from sidebar links and settings, so you can move between DzzenOS operations and OpenClaw system management without context switching across tools.',
      ],
      ru: [
        'Sidebar — основная навигация: Dashboard, Agents, Workspace (дерево Projects), Docs и Settings. На мобильных используется компактная нижняя навигация.',
        'Память теперь изолирована внутри каждого проекта в ветке Workspace. Docs остаются каноничным продуктовым справочником.',
        'OpenClaw UI доступен из ссылок в sidebar и settings, поэтому можно переключаться между операциями DzzenOS и системным управлением OpenClaw без перехода между разными инструментами.',
      ],
    },
    highlights: {
      en: [
        'Desktop: full sidebar-first workflow.',
        'Mobile: optimized quick access to main sections.',
        'Workspace tree supports project expansion and active task visibility.',
        'Settings includes access to archived projects.',
      ],
      ru: [
        'Desktop: полноценный sidebar-first рабочий процесс.',
        'Mobile: оптимизированный быстрый доступ к ключевым разделам.',
        'Дерево Workspace поддерживает раскрытие проектов и просмотр активных задач.',
        'В Settings есть доступ к архиву проектов.',
      ],
    },
  },
  {
    id: 'dashboard',
    group: { en: 'Workspace Usage', ru: 'Работа в Workspace' },
    title: { en: 'Dashboard: Daily Triage', ru: 'Dashboard: ежедневный triage' },
    summary: {
      en: 'Monitor stuck runs, failures, approvals, and board status in one place.',
      ru: 'Следите за stuck runs, ошибками, approvals и состоянием доски в одном месте.',
    },
    intro: {
      en: [
        'Dashboard is your global operational control panel. Start your day here to identify what needs immediate intervention across all active projects.',
        'The dashboard is fixed as the future pulse page of the whole workspace (cross-project status, runs, approvals, and workload).',
        'Use board selector to switch context. You can open any task directly from recent tasks, stuck runs, failed runs, or approvals.',
        'Approvals are actionable from the dashboard itself: approve or reject directly to keep execution moving.',
      ],
      ru: [
        'Dashboard — ваша глобальная операционная панель. Начинайте день здесь, чтобы сразу увидеть, где нужно вмешательство по всем активным проектам.',
        'Dashboard зафиксирован как целевая pulse-страница workspace (кросс-проектные статусы, runs, approvals и загрузка).',
        'Через выбор доски переключайте контекст. Любую задачу можно открыть прямо из recent tasks, stuck runs, failed runs или approvals.',
        'С approvals можно работать прямо в Dashboard: подтверждать или отклонять без перехода в другие экраны.',
      ],
    },
    highlights: {
      en: [
        'Board status counts by workflow stage.',
        'Recent tasks with one-click navigation into task drawer.',
        'Stuck run detection (running for 10+ minutes).',
        'Pending approvals with direct approve/reject controls.',
      ],
      ru: [
        'Счётчики статусов доски по этапам workflow.',
        'Recent tasks с открытием карточки в один клик.',
        'Детекция зависших runs (выполняются более 10 минут).',
        'Pending approvals с прямыми кнопками approve/reject.',
      ],
    },
  },
  {
    id: 'kanban',
    group: { en: 'Workspace Usage', ru: 'Работа в Workspace' },
    title: { en: 'Kanban: Capture and Execute', ru: 'Kanban: фиксация и исполнение' },
    summary: {
      en: 'Boards, task flow control, quick capture, search, and bulk actions.',
      ru: 'Доски, управление потоком задач, быстрый capture, поиск и bulk-действия.',
    },
    intro: {
      en: [
        'Kanban is the main execution surface. Use it to create boards, capture ideas fast, move tasks through statuses, and open task cards for deep work.',
        'The default status flow is: ideas -> todo -> doing -> review -> release -> done -> archived.',
        'For high-volume workflows, use selection mode and bulk status moves. Search and archived filter help keep active board state clean.',
      ],
      ru: [
        'Kanban — основной экран исполнения. Здесь вы создаете доски, быстро фиксируете идеи, двигаете задачи по статусам и открываете карточки для глубокой работы.',
        'Базовый поток статусов: ideas -> todo -> doing -> review -> release -> done -> archived.',
        'Для объемных процессов используйте selection mode и bulk-перевод статусов. Поиск и фильтр archived помогают держать активное состояние доски чистым.',
      ],
    },
    highlights: {
      en: [
        'Create board with name and description.',
        'Quick idea capture input with keyboard shortcuts.',
        'Bulk select and move for operational batching.',
        'Task search and optional archived visibility.',
      ],
      ru: [
        'Создание доски с названием и описанием.',
        'Быстрый capture идей с клавиатурными шорткатами.',
        'Bulk select и массовый перевод задач для пакетной работы.',
        'Поиск по задачам и опциональный показ archived.',
      ],
    },
    commands: [
      {
        id: 'kanban-create-task',
        title: { en: 'Create a task via API', ru: 'Создать задачу через API' },
        description: {
          en: 'Useful for bot integrations and external capture channels.',
          ru: 'Полезно для bot-интеграций и внешних каналов capture.',
        },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks \\
  -H 'content-type: application/json' \\
  -d '{"title":"Ship launch checklist","boardId":"<board-id>","status":"ideas"}'`,
      },
      {
        id: 'kanban-move-task',
        title: { en: 'Move task to execution', ru: 'Перевести задачу в исполнение' },
        description: {
          en: 'Moves task into active execution stage.',
          ru: 'Переводит задачу в активную стадию исполнения.',
        },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id> \\
  -X PATCH -H 'content-type: application/json' \\
  -d '{"status":"doing"}'`,
      },
    ],
  },
  {
    id: 'task-card',
    group: { en: 'Workspace Usage', ru: 'Работа в Workspace' },
    title: { en: 'Task Card: Agent-Driven Execution', ru: 'Карточка задачи: агентное исполнение' },
    summary: {
      en: 'Manage title, status, description, checklist, runs, approvals, and chat in one drawer.',
      ru: 'Управляйте title, status, description, checklist, runs, approvals и chat в одном drawer.',
    },
    intro: {
      en: [
        'Task card is the core execution unit. It contains all task context and all execution traces.',
        'You can run planning mode, execute mode, request approvals, stop active runs, and iterate with chat without leaving the task context.',
        'Runs panel shows execution history and step-level status so outcomes are auditable and explainable.',
      ],
      ru: [
        'Карточка задачи — ключевая единица исполнения. В ней собран весь контекст задачи и все следы выполнения.',
        'Вы можете запускать plan/execute, запрашивать approvals, останавливать активные runs и дорабатывать результат через chat, не выходя из контекста задачи.',
        'Панель Runs показывает историю выполнения и статус шагов, поэтому результаты можно прозрачно ревьюить.',
      ],
    },
    highlights: {
      en: [
        'Plan mode for structured task breakdown.',
        'Run now / execute mode for active processing.',
        'Two-step stop confirmation for safe interruption.',
        'Approvals tab for human-in-the-loop control.',
      ],
      ru: [
        'Режим Plan для структурной декомпозиции задачи.',
        'Run now / execute mode для активной обработки.',
        'Двухшаговое подтверждение stop для безопасного прерывания.',
        'Вкладка Approvals для human-in-the-loop контроля.',
      ],
    },
    commands: [
      {
        id: 'task-run-plan',
        title: { en: 'Run planning mode', ru: 'Запустить режим планирования' },
        description: {
          en: 'Creates planning output and checklist suggestions.',
          ru: 'Создает результат планирования и предложения для чеклиста.',
        },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/run \\
  -X POST -H 'content-type: application/json' \\
  -d '{"mode":"plan"}'`,
      },
      {
        id: 'task-run-execute',
        title: { en: 'Run execution mode', ru: 'Запустить режим выполнения' },
        description: {
          en: 'Starts task execution run.',
          ru: 'Запускает run выполнения задачи.',
        },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/run \\
  -X POST -H 'content-type: application/json' \\
  -d '{"mode":"execute"}'`,
      },
      {
        id: 'task-chat',
        title: { en: 'Send chat message in task session', ru: 'Отправить сообщение в task session' },
        description: {
          en: 'Refines output while preserving task context.',
          ru: 'Уточняет результат, сохраняя контекст задачи.',
        },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/tasks/<task-id>/chat \\
  -X POST -H 'content-type: application/json' \\
  -d '{"text":"Refine this plan and add risk mitigation"}'`,
      },
      {
        id: 'task-stop',
        title: { en: 'Stop active run', ru: 'Остановить активный run' },
        description: {
          en: 'Soft-cancels a running task process.',
          ru: 'Мягко отменяет выполняющийся процесс задачи.',
        },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/tasks/<task-id>/stop -X POST',
      },
    ],
  },
  {
    id: 'automations',
    group: { en: 'Platform Modules', ru: 'Модули платформы' },
    title: { en: 'Automations', ru: 'Automations' },
    summary: {
      en: 'Create, save, run, and iterate workflow graphs using the built-in automation editor.',
      ru: 'Создавайте, сохраняйте, запускайте и улучшайте графы автоматизаций во встроенном редакторе.',
    },
    intro: {
      en: [
        'Automations page provides a visual flow editor (React Flow skeleton), plus library management and run actions.',
        'Current pattern: create new flow, save as new, edit and save selected flow, run now for validation.',
        'Use this for recurring internal routines before pushing heavier orchestration into external systems.',
      ],
      ru: [
        'Страница Automations дает визуальный редактор flow (React Flow skeleton), управление библиотекой и запуск сценариев.',
        'Текущий паттерн: создать flow, сохранить как новый, выбрать и отредактировать сохраненный flow, запустить вручную для проверки.',
        'Используйте это для регулярных внутренних рутин до выноса сложной оркестрации во внешние системы.',
      ],
    },
    highlights: {
      en: [
        'Library of saved automations with quick selection.',
        'Save as new and Save for existing automation updates.',
        'Run now action for immediate execution.',
        'Designed to evolve into richer palette and graph controls.',
      ],
      ru: [
        'Библиотека сохраненных автоматизаций с быстрым выбором.',
        'Save as new и Save для обновления существующих сценариев.',
        'Run now для немедленного запуска.',
        'Архитектурно готово к расширению palette и graph-контролов.',
      ],
    },
    commands: [
      {
        id: 'automations-list',
        title: { en: 'List automations', ru: 'Список автоматизаций' },
        description: { en: 'Returns saved automation items.', ru: 'Возвращает сохраненные элементы автоматизаций.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/automations | jq',
      },
      {
        id: 'automations-run',
        title: { en: 'Run automation now', ru: 'Запустить automation сейчас' },
        description: { en: 'Starts execution for selected automation.', ru: 'Запускает выполнение выбранной automation.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/automations/<automation-id>/run -X POST',
      },
    ],
  },
  {
    id: 'agents',
    group: { en: 'Platform Modules', ru: 'Модули платформы' },
    title: { en: 'Agent Library', ru: 'Библиотека агентов' },
    summary: {
      en: 'Manage installed agents, presets, categories, prompt overrides, and enabled states.',
      ru: 'Управляйте установленными агентами, пресетами, категориями, prompt overrides и состоянием enabled.',
    },
    intro: {
      en: [
        'Agent Library defines reusable agent profiles used by task sessions.',
        'You can search, filter by category, enable/disable agents, install presets, and create custom agents.',
        'Each profile can carry metadata such as description, tags, skills linkage, and prompt override stages.',
      ],
      ru: [
        'Agent Library определяет переиспользуемые профили агентов для task sessions.',
        'Можно искать, фильтровать по категории, включать/выключать агентов, ставить пресеты и создавать кастомных агентов.',
        'Каждый профиль содержит метаданные: описание, теги, привязку skills и стадии prompt overrides.',
      ],
    },
    highlights: {
      en: [
        'Installed and Marketplace views in one screen.',
        'Quick enable/disable toggles for safe rollout.',
        'Preset install flow for faster onboarding.',
        'Custom agent creation for team-specific workflows.',
      ],
      ru: [
        'Installed и Marketplace блоки в одном экране.',
        'Быстрые enable/disable переключатели для безопасного rollout.',
        'Установка пресетов для ускоренного онбординга.',
        'Создание кастомных агентов под командные процессы.',
      ],
    },
  },
  {
    id: 'skills',
    group: { en: 'Platform Modules', ru: 'Модули платформы' },
    title: { en: 'Skills', ru: 'Skills' },
    summary: {
      en: 'Control tool capabilities, installation sources, and operational safety boundaries.',
      ru: 'Контролируйте capability инструментов, источники установки и границы операционной безопасности.',
    },
    intro: {
      en: [
        'Skills define what actions agents can perform. Manage them carefully to align with your security posture.',
        'You can install marketplace presets, configure custom skills, disable risky skills, and remove unused ones.',
        'Capabilities include network, filesystem, external_write, and secret requirements visibility.',
      ],
      ru: [
        'Skills определяют, какие действия могут выполнять агенты. Управляйте ими аккуратно в соответствии с вашей security-моделью.',
        'Можно ставить marketplace-пресеты, настраивать кастомные skills, отключать рискованные и удалять неиспользуемые.',
        'Capabilities включают network, filesystem, external_write и отображение требований к secrets.',
      ],
    },
    highlights: {
      en: [
        'Installed vs available preset clarity.',
        'Capability visibility per skill card.',
        'Enable/disable and uninstall controls.',
        'Manual addition for custom internal skills.',
      ],
      ru: [
        'Понятное разделение installed и available preset.',
        'Видимость capability на карточке каждого skill.',
        'Управление через enable/disable и uninstall.',
        'Ручное добавление кастомных внутренних skills.',
      ],
    },
    commands: [
      {
        id: 'skills-list',
        title: { en: 'List installed skills', ru: 'Список установленных skills' },
        description: { en: 'Returns configured skills and capability flags.', ru: 'Возвращает настроенные skills и capability-флаги.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/skills | jq',
      },
    ],
  },
  {
    id: 'models',
    group: { en: 'Platform Modules', ru: 'Модули платформы' },
    title: { en: 'Models', ru: 'Модели' },
    summary: {
      en: 'Manage OpenClaw model providers without leaving DzzenOS UI.',
      ru: 'Управляйте провайдерами моделей OpenClaw, не выходя из UI DzzenOS.',
    },
    intro: {
      en: [
        'Models page is a practical control surface for provider lifecycle: connect, edit, OAuth start, scan, apply, and delete.',
        'Use filters and search to inspect current runtime model catalog after scan/apply operations.',
        'This allows operators to keep model infrastructure healthy without opening separate consoles for routine tasks.',
      ],
      ru: [
        'Страница Models — практическая панель управления lifecycle провайдеров: connect, edit, OAuth start, scan, apply и delete.',
        'Используйте фильтры и поиск, чтобы проверять runtime-каталог моделей после операций scan/apply.',
        'Это позволяет поддерживать модельную инфраструктуру в рабочем состоянии без переключения в отдельные консоли для рутинных задач.',
      ],
    },
    highlights: {
      en: [
        'Provider connection dialog with auth mode settings.',
        'OAuth status flow and retry support.',
        'Scan and Apply actions for runtime catalog sync.',
        'Model table with provider and availability filters.',
      ],
      ru: [
        'Диалог подключения провайдера с настройками auth mode.',
        'OAuth-статусы и поддержка повторного запуска.',
        'Действия Scan и Apply для синхронизации runtime-каталога.',
        'Таблица моделей с фильтрами по провайдеру и доступности.',
      ],
    },
    commands: [
      {
        id: 'models-overview',
        title: { en: 'Get models overview', ru: 'Получить обзор моделей' },
        description: { en: 'Returns providers and runtime models.', ru: 'Возвращает провайдеров и runtime-модели.' },
        language: 'bash',
        code: 'curl -s http://127.0.0.1:8787/openclaw/models/overview | jq',
      },
      {
        id: 'models-scan',
        title: { en: 'Scan models', ru: 'Сканировать модели' },
        description: { en: 'Refreshes model catalog from providers.', ru: 'Обновляет каталог моделей от провайдеров.' },
        language: 'bash',
        code: "curl -s http://127.0.0.1:8787/openclaw/models/scan -X POST -H 'content-type: application/json' -d '{}'",
      },
      {
        id: 'models-apply',
        title: { en: 'Apply model config', ru: 'Применить конфиг моделей' },
        description: { en: 'Applies provider/model configuration.', ru: 'Применяет конфигурацию провайдеров и моделей.' },
        language: 'bash',
        code: "curl -s http://127.0.0.1:8787/openclaw/models/apply -X POST -H 'content-type: application/json' -d '{}'",
      },
    ],
  },
  {
    id: 'memory',
    group: { en: 'Knowledge', ru: 'Знания' },
    title: { en: 'Memory', ru: 'Memory' },
    summary: {
      en: 'Store workspace overview, board notes, and changelog in one writable context layer.',
      ru: 'Храните overview workspace, заметки досок и changelog в одном записываемом контекстном слое.',
    },
    intro: {
      en: [
        'Memory is where operational context lives. Keep project-level overview and board-level context current so agent execution stays grounded.',
        'Use changelog as a quick continuity ledger: what changed, why, and when.',
        'Do not overload product docs with workspace-specific notes; keep that information in Memory.',
      ],
      ru: [
        'Memory — место для операционного контекста. Поддерживайте в актуальном состоянии проектный overview и board-контекст, чтобы агентное исполнение оставалось точным.',
        'Используйте changelog как короткий журнал преемственности: что изменилось, зачем и когда.',
        'Не перегружайте продуктовую документацию workspace-заметками; держите такую информацию в Memory.',
      ],
    },
    highlights: {
      en: [
        'Editable workspace overview.',
        'Editable board-specific context docs.',
        'Read-only board changelog timeline.',
        'Fast board switching from left panel.',
      ],
      ru: [
        'Редактируемый workspace overview.',
        'Редактируемые docs с контекстом конкретной доски.',
        'Read-only timeline board changelog.',
        'Быстрое переключение досок через левую панель.',
      ],
    },
    commands: [
      {
        id: 'memory-summary',
        title: { en: 'Append board summary', ru: 'Добавить summary в board' },
        description: {
          en: 'Useful after weekly review, release, or major decision.',
          ru: 'Полезно после weekly review, релиза или важного решения.',
        },
        language: 'bash',
        code: `curl -s http://127.0.0.1:8787/docs/boards/<board-id>/summary \\
  -X POST -H 'content-type: application/json' \\
  -d '{"title":"Weekly review","summary":"- Closed blockers\\n- Updated roadmap\\n- Set next priorities"}'`,
      },
    ],
  },
  {
    id: 'security-ops',
    group: { en: 'Operations', ru: 'Операции' },
    title: { en: 'Security and Operational Safety', ru: 'Безопасность и операционная надежность' },
    summary: {
      en: 'Protect data integrity with backups, migration discipline, and controlled approval flows.',
      ru: 'Защищайте целостность данных через backups, дисциплину миграций и контролируемые approval-потоки.',
    },
    intro: {
      en: [
        'DzzenOS is built for safe local operation, but operational discipline is still required: regular backups, controlled rollout, and clear ownership of high-risk actions.',
        'Approval workflows and capability boundaries are central to safe usage. Keep risky skills disabled unless explicitly required.',
        'Before upgrades or schema-sensitive operations, validate backups and recovery procedures.',
      ],
      ru: [
        'DzzenOS спроектирован для безопасной локальной эксплуатации, но операционная дисциплина обязательна: регулярные backups, контролируемый rollout и явная ответственность за рискованные действия.',
        'Approval-потоки и границы capability — центральная часть безопасного использования. Держите рискованные skills выключенными, если они не нужны явно.',
        'Перед апгрейдами или schema-чувствительными операциями проверяйте backups и процедуры восстановления.',
      ],
    },
    highlights: {
      en: [
        'Backup/restore runbooks are documented.',
        'Release rollback is supported.',
        'Origin and session protections are enforced in API.',
        'Security smoke tests can be run on demand.',
      ],
      ru: [
        'Runbook-и по backup/restore задокументированы.',
        'Поддерживается rollback релизов.',
        'В API применяются защиты origin и session.',
        'Security smoke tests запускаются по требованию.',
      ],
    },
    commands: [
      {
        id: 'ops-backups',
        title: { en: 'List backups', ru: 'Список резервных копий' },
        description: { en: 'Verify that recovery points exist.', ru: 'Проверить, что точки восстановления существуют.' },
        language: 'bash',
        code: 'bash ~/dzzenos-openclaw/scripts/dzzenos-admin.sh db backup list',
      },
      {
        id: 'ops-security-tests',
        title: { en: 'Run security tests', ru: 'Запустить security-тесты' },
        description: { en: 'Runs core security smoke suite.', ru: 'Запускает базовый security smoke-набор.' },
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
        label: { en: 'Database Guide', ru: 'Руководство по базе данных' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/database.md',
      },
      {
        label: { en: 'Release Operations', ru: 'Операции релизов' },
        href: 'https://github.com/Dzzen-com/DzzenOS-OpenClaw/blob/main/Docs/RELEASE-OPERATIONS.md',
      },
    ],
  },
  {
    id: 'troubleshooting',
    group: { en: 'Operations', ru: 'Операции' },
    title: { en: 'Troubleshooting Quick Guide', ru: 'Быстрый гайд по troubleshooting' },
    summary: {
      en: 'Fast checks when something feels wrong in UI or execution flow.',
      ru: 'Быстрые проверки, когда что-то работает не так в UI или execution-потоке.',
    },
    intro: {
      en: [
        'If tasks do not update, first check API availability and event stream health.',
        'If model operations fail, inspect provider auth state and rerun scan/apply.',
        'If execution stalls, check Dashboard stuck runs and stop/restart affected tasks from task card.',
      ],
      ru: [
        'Если задачи не обновляются, сначала проверьте доступность API и состояние event stream.',
        'Если операции с моделями падают, проверьте auth state провайдера и повторите scan/apply.',
        'Если исполнение зависает, проверьте stuck runs в Dashboard и перезапустите проблемные задачи из карточки.',
      ],
    },
    highlights: {
      en: [
        'Validate API first, then UI state.',
        'Use Dashboard for fast incident triage.',
        'Use Memory changelog for continuity after incidents.',
        'Escalate with logs and exact reproduction steps.',
      ],
      ru: [
        'Сначала проверяйте API, затем состояние UI.',
        'Используйте Dashboard для быстрого incident-triage.',
        'Используйте Memory changelog для восстановления контекста после инцидентов.',
        'Эскалируйте проблему с логами и точными шагами воспроизведения.',
      ],
    },
    commands: [
      {
        id: 'troubleshooting-events',
        title: { en: 'Watch realtime events', ru: 'Смотреть realtime-события' },
        description: { en: 'Checks whether event stream is active.', ru: 'Проверяет, активен ли поток событий.' },
        language: 'bash',
        code: 'curl -N http://127.0.0.1:8787/events',
      },
      {
        id: 'troubleshooting-runs',
        title: { en: 'List running runs', ru: 'Список выполняющихся runs' },
        description: { en: 'Useful for checking stuck execution.', ru: 'Полезно для проверки зависшего выполнения.' },
        language: 'bash',
        code: 'curl -s "http://127.0.0.1:8787/runs?status=running" | jq',
      },
    ],
  },
];

function l<T>(value: Localized<T>, locale: Locale): T {
  return locale === 'ru' ? value.ru : value.en;
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

  for (const paragraph of l(section.intro, locale)) {
    lines.push(paragraph);
    lines.push('');
  }

  lines.push('## Highlights');
  lines.push('');
  for (const item of l(section.highlights, locale)) lines.push(`- ${item}`);
  lines.push('');

  if (section.commands?.length) {
    lines.push('## Commands');
    lines.push('');
    for (const cmd of section.commands) {
      lines.push(`### ${l(cmd.title, locale)}`);
      lines.push('');
      lines.push(l(cmd.description, locale));
      lines.push('');
      lines.push(`\`\`\`${cmd.language}`);
      lines.push(cmd.code);
      lines.push('\`\`\`');
      lines.push('');
    }
  }

  if (section.links?.length) {
    lines.push('## Related Docs');
    lines.push('');
    for (const link of section.links) {
      const note = link.note ? ` - ${l(link.note, locale)}` : '';
      lines.push(`- ${l(link.label, locale)}: ${link.href}${note}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function DocsPage() {
  const { i18n } = useTranslation();
  const locale: Locale = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';
  const [query, setQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState(DOCS_SECTIONS[0]?.id ?? '');
  const [pageFeedback, setPageFeedback] = useState('');
  const [codeFeedbackById, setCodeFeedbackById] = useState<Record<string, string>>({});

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
    () => filteredSections.find((s) => s.id === activeSectionId) ?? filteredSections[0] ?? null,
    [filteredSections, activeSectionId],
  );

  const groupedSections = useMemo(() => {
    const groups = new Map<string, DocsSection[]>();
    for (const section of filteredSections) {
      const key = l(section.group, locale);
      const list = groups.get(key) ?? [];
      list.push(section);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [filteredSections, locale]);

  const setTimedPageFeedback = (text: string) => {
    setPageFeedback(text);
    window.setTimeout(() => setPageFeedback(''), 1800);
  };

  const setTimedCodeFeedback = (id: string, text: string) => {
    setCodeFeedbackById((prev) => ({ ...prev, [id]: text }));
    window.setTimeout(() => {
      setCodeFeedbackById((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, 1800);
  };

  const onCopyPage = async () => {
    if (!activeSection) return;
    const ok = await copyText(sectionMarkdown(activeSection, locale));
    setTimedPageFeedback(ok ? l(UI_COPY.copied, locale) : l(UI_COPY.copyFailed, locale));
  };

  const onOpenInAssistant = async (target: AssistantTarget) => {
    if (!activeSection) return;
    const payload = sectionMarkdown(activeSection, locale);
    await copyText(payload);
    window.open(AI_TARGETS[target].toUrl(payload), '_blank', 'noopener,noreferrer');
    setTimedPageFeedback(`${l(UI_COPY.triedOpen, locale)} ${AI_TARGETS[target].label}`);
  };

  const onCopyCode = async (command: DocsCommand) => {
    const ok = await copyText(command.code);
    setTimedCodeFeedback(command.id, ok ? l(UI_COPY.copied, locale) : l(UI_COPY.copyFailed, locale));
  };

  return (
    <div className="flex w-full flex-col gap-5 text-slate-100">
      <PageHeader
        title={locale === 'ru' ? 'Документация' : 'Docs'}
        subtitle={l(UI_COPY.pageSubtitle, locale)}
      />

      <div className="border-b border-slate-800/80 pb-3">
        <p className="text-sm text-slate-300">{l(UI_COPY.platformLead, locale)}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px,minmax(0,1fr)]">
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
                    <Button size="sm" variant="ghost" onClick={() => onOpenInAssistant('cursor')}>
                      {l(UI_COPY.cursor, locale)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onOpenInAssistant('codex')}>
                      {l(UI_COPY.codex, locale)}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onOpenInAssistant('claude')}>
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
                {l(activeSection.highlights, locale).map((item, idx) => (
                  <li key={`${activeSection.id}-hl-${idx}`} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
                    <span>{item}</span>
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
                      <div className="mt-1 text-[11px] text-slate-500">{codeFeedbackById[command.id] ?? l(UI_COPY.copyCode, locale)}</div>
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
