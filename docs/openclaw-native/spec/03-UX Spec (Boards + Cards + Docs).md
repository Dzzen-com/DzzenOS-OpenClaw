# DzzenOS (OpenClaw Native) — UX Spec

## 0) Цель UX
Сделать так, чтобы:
- пользователь ведёт работу в досках
- агент живёт **внутри карточки**
- документы “как Obsidian” встроены в продукт (workspace docs + board docs)

Главный принцип: **карточка задачи = главный экран**.

---

## 1) Информационная архитектура

### Левое меню (глобально)
- Workspaces (переключатель)
- Boards (список)
- Docs (workspace)
- Agent Library (профили/пакеты)
- Settings (policy/budgets/integrations)

### Внутри Workspace
- Boards: Founder Ops, Content, Custom…
- Docs:
  - Workspace Docs (общие)
  - Board Docs (контекст домена)

---

## 2) Board UI

### 2.1 Основной вид: Kanban
Колонки по Status:
- Inbox / Backlog / Next / In Progress / Review / Blocked / Done

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
