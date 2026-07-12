# Screen Specification: Settings Panel

## 1. Purpose
Integration console and configuration manager.

---

## 2. Layout & Structure
- **Layout**: Two-column layout grid.
- **Top Margin**: `24px` under page titles.

---

## 3. Core Components Used
- `<Card>`: Primary container.
- `<Select>`: Choose views, theme toggles, and start of week.
- `<Button>`: Connect Google Calendar, Disconnect triggers.
- `<Skeleton>`: Integration active check loader.

---

## 4. Allowed Interactions
- **Connect Integration**: Redirects to OAuth URL.
- **Toggle Options**: Instant theme saving (`localStorage`).

---

## 5. Design Constraints (Forbidden Items)
- **No Developer Console Outputs**: Sensitive tokens must never render on the screen.
- **No Extraneous Dashboard Cards**: Do not show server statistics, CPU graphs, or API telemetry.
