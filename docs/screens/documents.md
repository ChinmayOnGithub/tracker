# Screen Specification: Secure Vault

## 1. Purpose
Secure file vault and encrypted markdown document repository.

---

## 2. Layout & Structure
- **Layout**: Two-column layout (sidebar with document lists, main area for markdown viewer and editor).

---

## 3. Core Components Used
- `<Input>`: Vault passcode verification input, document title edit.
- `<Textarea>`: Markdown editing window.
- `<Button>`: Edit, Delete, Save, and New Document triggers.
- `<Card>`: Primary visual boundary wrapper.

---

## 4. Allowed Interactions
- **Unlock**: Entering password unlocks the documents store in-memory.
- **Auto-lock**: Automatically locks and hides text if tab loses focus or 10 minutes pass.
- **Markdown Render**: Split screen preview of compiled HTML.

---

## 5. Design Constraints (Forbidden Items)
- **No Plaintext Storage**: Plaintext credentials must never reside in local storage.
- **No Cloud Backup Indicator**: Keep vault entirely local.
- **No Rich Text Toolbar**: Document editor is pure Markdown text.
