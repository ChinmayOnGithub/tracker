# Screen Specification: Wishlist Panel (Future Expansion)

## 1. Purpose
Tracks personal savings goals, desired acquisitions, and gift list items.

---

## 2. Layout & Structure
- **Layout**: Simple card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
- **Paddings**: Page padding of `24px` on desktop, `16px` on mobile.

---

## 3. Core Components Used
- `<Card>`: Target item visual card containers.
- `<Input>`: Item Name, Price/Cost estimate, and Web purchase Link.
- `<Select>`: Priority picker (High, Medium, Low).
- `<Button>`: Add Item, Delete Item, Archive triggers.

---

## 4. Allowed Interactions
- **Add Wishlist Item**: Launches creation dialog, logs target cost parameters.
- **Link Click**: Direct redirect to purchase URL.
- **Archive Item**: Marks item purchased and archives it out of view.

---

## 5. Design Constraints (Forbidden Items)
- **No Direct Merchant Integration**: No background web-scraping price checkers or merchant API calls.
- **No Complex Savings Milestones**: Simple cost mapping. Do not show savings meters, compound interest projections, or banking details.
