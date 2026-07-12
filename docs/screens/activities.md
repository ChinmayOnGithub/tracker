# Screen Specification: Activities Manager

## 1. Purpose
Management center for editing, creating, duplicating, and archiving activity templates.

---

## 2. Layout & Structure
- **Layout**: Main header + action control bar + central activities listing stack.

---

## 3. Core Components Used
- `<ActivityManager>`: Core manager widget.
- `<Input>`: Search query entry field.
- `<Select>`: Category filter, priority filter, sorting option dropdowns.
- `<Button>`: Duplicate, Edit, Archive, or bulk actions triggers.
- `<TemplateModal>`: Popup form to configure templates.

---

## 4. Allowed Interactions
- **Live Search**: Filtering listing as the user enters characters.
- **Bulk Selection**: Checking box in headers highlights all visible entries.
- **Reordering**: Manual ordering arrow clicks swap template position order.
- **Archive / Duplicate**: Actions toggle templates active flags.

---

## 5. Design Constraints (Forbidden Items)
- **No Complex Dashboards**: This is a direct configuration interface. Do not render completion graphs, statistics, or status meters.
- **No Nested Modals**: Opening the Advanced Options menu must happen inline, not in separate modals.
