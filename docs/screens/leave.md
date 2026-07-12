# Screen Specification: Time Off (Leave) Panel

## 1. Purpose
Tracks annual leave allowances, requests, and holidays.

---

## 2. Layout & Structure
- **Layout**: Top balance cards row + split column (left column for new request form, right column for requests history table).

---

## 3. Core Components Used
- `<Select>`: Selection for Leave Type.
- `<Input>`: Start Date, End Date, and Notes inputs.
- `<Card>`: Outer wrappers for allowances cards.
- `<Button>`: Submit Request, Delete Request triggers.

---

## 4. Allowed Interactions
- **Submit Request**: Submits start/end range, triggers transaction spinner, updates lists.
- **Delete Request**: Deletes holiday record and cleans associated activity logs.

---

## 5. Design Constraints (Forbidden Items)
- **No Complex Approval Workflows**: Designed for personal tracking. Do not add manager signature fields or approval steps.
- **No Saturated Balance Meters**: Allowance indicators must use smooth desaturated bar fills.
