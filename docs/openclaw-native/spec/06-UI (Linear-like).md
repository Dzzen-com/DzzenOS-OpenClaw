# DzzenOS (OpenClaw Native) — UI (Linear-like)

Цель: единый визуальный стиль и UX по аналогии с **Linear**:
- быстрый
- минималистичный
- keyboard-first
- отличный канбан/листы
- удобные детали карточки + сайдбар

---

## 1) Принципы интерфейса
1) **Speed**: мгновенная навигация, минимальные перерисовки.
2) **Keyboard-first**: быстрые хоткеи для создания/поиска/движения карточек.
3) **Drawer for details**: карточка открывается справа (или full page на мобиле).
4) **Сохранённые views**: фильтры как first-class.
5) **Стабильный визуальный язык**: статусы, теги, приоритеты, домены.

---

## 2) Основные экраны
- Workspace switcher
- Kanban landing: grid всех досок + создание новой
- Board (kanban + list view)
- Task drawer (brief + chat + runs/artifacts)
- Docs (workspace/board)
- Automations builder (graph editor)
- Agent library (profiles/packs)
- Settings (policy/skills)

Глобальный слой:
- Левое меню (sidebar‑first) как основной навигатор
- Без глобального top bar / footer (контекст задаётся локальными header‑блоками страниц)
- Мобильный гибрид: нижняя панель + выезжающий sidebar
- Единая типографика и цветовые токены на всех экранах
- Login page в том же стиле, что и Kanban (темный градиент, карточка входа)
- **Settings dropdown** внизу сайдбара (DzzenOS Settings / OpenClaw Settings)
- **PageHeader** для контекстных заголовков и действий на страницах

---

## 3) Компоненты (референс)
- Command palette (Ctrl+K)
- Quick add task
- Status pill
- Domain/priority chips
- Agent status strip (running/idle + stage + mini bar)
- Reasoning selector (auto/off/low/medium/high)
- Stop run control (soft cancel)
- Minimal activity ticker (latest steps)
- Token usage hint (in/out or total)
- Stage badge in status strip (glowing dot)
- Agent heartbeat on card while running
- Activity / run timeline
- Artifact preview (markdown/diff)
- Approval banner (approve/reject)

---

## 4) Технические решения (чтобы было "как Linear")
- UI: React + Tailwind (или CSS variables) + Radix UI
- Состояние: query cache (tanstack-query)
- Виртуализация списков (react-virtual)
- Горячие клавиши (react-hotkeys)

---

## 5) Важное про чат агента в карточке
- чат как отдельная "сессия" по task
- быстрые пресеты промптов (Ask / Refine / Generate / Validate)
- кнопка Start создаёт run и фиксирует input snapshot

---

## 6) Совместимость с OpenClaw
UI может жить:
- как локальный webapp (localhost) с ссылкой из OpenClaw dashboard
- либо как страница внутри OpenClaw UI (если плагин‑точки позволяют)

MVP: локальный webapp.
