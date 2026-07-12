# Screen Specification: Calendar View

## 1. Purpose
The Calendar serves as a visual planning board, showing task intensities, public holidays, and external sync schedules across months and weeks.

---

## 2. Layout & Structure
- **Layout**: Full-screen grid card wrapper.
- **Grids**: 7-column grid mapping to calendar weekdays.

---

## 3. Core Components Used
- `<Calendar>`: Primary month grid drawer.
- `<Card>`: Primary visual boundary wrapper.
- `<DayLogsModal>`: Slide-out drawer displaying detailed listings for a selected day.
- `<Select>`: Month view vs week view selectors.

---

## 4. Allowed Interactions
- **Day Click**: Launches `<DayLogsModal>` right-slide drawer to view or log activities.
- **Next / Prev Nav**: Standard chevron buttons to paginate months.
- **View Toggle**: Segmented controls to toggle between Month, Week, and Agenda lists.

---

## 5. Design Constraints (Forbidden Items)
- **No Heavy Outlines**: Grid divisions must use fine 1px `--color-border` lines.
- **No Floating Date Cards**: Days must align flat inside the parent table grid.
- **No Flashy Transitions**: Paginations must immediately replace grid cells without sliding animations.
