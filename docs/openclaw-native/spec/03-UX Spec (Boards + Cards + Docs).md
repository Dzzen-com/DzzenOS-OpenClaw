# DzzenOS (OpenClaw Native) — UX Spec

## 0) Цель UX
Сделать так, чтобы:
- пользователь ведёт работу в досках
- агент живёт **внутри карточки**
- документы “как Obsidian” встроены в продукт (workspace docs + board docs)

Главный принцип: **карточка задачи = главный экран**.

---

## 1) Информационная архитектура

### Left menu (global)
- Workspace switcher (future)
- **Sidebar-first navigation**: Dashboard / Kanban / Automations / Agents / Docs
- **OpenClaw Settings** entry in sidebar menu
- **Settings dropdown** at the bottom of the sidebar

### Global layout
- **Sidebar-first layout** (no global Top bar / Footer)
- **Local PageHeader** per screen (title + subtitle + actions)
- **Mobile hybrid nav**: bottom tabs + sidebar drawer
- Login page matches Kanban style (dark gradient, brand card)

### Внутри Workspace
- Boards: Founder Ops, Content, Custom…
- Docs:
  - Workspace Docs (общие)
  - Board Docs (контекст домена)

---

## 2) Board UI

### 2.1 Main view: Kanban
**Landing flow**: Boards grid → select a board → TaskBoard.

Status columns:
- Ideas / To do / In progress / Review / Release / Done / Archived

Empty state:
- If no boards exist, show a primary CTA (“Create your first board”) and keep the flow minimal.

Quick capture:
- A fast input to capture ideas directly into **Ideas** without opening a modal.

Bulk actions:
- Multi-select cards for status changes or archive.

### 2.2 Views (фильтры)
Важно сделать сохранённые представления:
- Founder Ops view (Domain=Founder Ops)
- Content pipeline view (Domain=Content)
- (Removed) Directus/Schema view

---

## 3) Карточка задачи (Task drawer / page)

### 3.1 Layout
Рекомендую 3 зоны:
1) **Brief** (слева/сверху): заголовок, описание, чеклист, ссылки
2) **Agent chat** (правый drawer): диалог агента по задаче
3) **Runs/Artifacts** (нижняя панель или вкладки): история запусков и результаты

### 3.2 Кнопки
- Chat (фокус на чат)
- Start / Retry
- Approve / Reject (если есть approvals)
- Mark Done

### 3.3 Что обязательно видно на карточке
- текущий Status
- Domain + Priority
- какой агент выбран (и откуда: board default или override)
- последний run: статус + время + (оценка стоимости, если есть)
- Agent status strip: running/idle + stage (Plan/Execute/Report) + elapsed time
- Reasoning control per task (auto/off/low/medium/high) with info tooltip
- Stop run button (soft cancel) for active sessions
- Minimal activity ticker (last 2–3 steps) inside the task drawer
- Token usage hint (input/output or total) when available
- Stop confirmation (two-step) + Shift+S shortcut in drawer
- Stage badge in status strip (glowing dot)
- Subtle agent heartbeat on kanban cards while running

---

## 4) Docs UI (как Obsidian, но проще)

### 4.1 Workspace Docs
- список/папки/теги
- markdown редактор
- быстрые ссылки “прикрепить к board” или “прикрепить к task”

### 4.2 Board Docs
- отдельный раздел документации для домена
- используется как “контекст по умолчанию” для всех карточек на доске

### 4.3 Встраивание документов в карточку
В карточке отображать блок “Context pack”:
- docs from workspace (pinned)
- docs from board (default)
- docs attached to this task

---

## 5) Templates
Флоу создания:
- New board → выбрать template (Founder Ops / Content / Custom)
- применить колонки + дефолтные board settings
- опционально добавить стартовые задачи

---

## 6) Интеграции/skills
В UI нужна страница:
- Installed skills
- Marketplace (потом)
- Политики: какие skills разрешены на уровне workspace/board
