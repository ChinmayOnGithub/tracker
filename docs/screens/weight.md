# Screen Specification: Weight Log Panel

## 1. Purpose
Tracks body weight changes, waist metrics, and physical parameters.

---

## 2. Layout & Structure
- **Layout**: Top weight sparkline graph card + main split layout (left for log entry form, right for history listing table).

---

## 3. Core Components Used
- `<Input>`: Numeric weight, waist size, chest parameters.
- `<Button>`: Save Log, Delete Entry triggers.
- `<Card>`: Primary wrapper.

---

## 4. Allowed Interactions
- **Save Weight Log**: Enters today's weight, updates sparkline instantly.
- **Delete Record**: Deletes past logs.

---

## 5. Design Constraints (Forbidden Items)
- **No Heavy Saturated Charts**: Only utilize the custom pure SVG desaturated sparkline graph (`Sparkline` component). Do not import heavy chart libraries.
- **No Weight Loss Goals/Badges**: Low cognitive load tracking. No motivational reward badges or alerts.
