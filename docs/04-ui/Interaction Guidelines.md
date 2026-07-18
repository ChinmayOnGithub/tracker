# Interaction Guidelines Specification

This document defines user states, keyboard controls, transition metrics, and interactive feedbacks for Tracker OS.

---

## 1. Interactive States

* **Hover**: Background shifts slightly (e.g., `bg-[var(--color-accent)]/50`). Cursor must show `pointer`. Transition duration must use `var(--motion-duration-fast)` (150ms).
* **Press (Active)**: Scale scales down slightly (`active:scale-[0.98]`) to provide physical click-through feedback.
* **Focus**: Avoid default browser outlines. Elements must use a 1px ring offset: `focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]`.
* **Disabled**: Inputs, buttons, and selects must be marked with `disabled`, styled with `opacity-40 cursor-not-allowed`.
* **Loading**: Buttons show a spinner or `Loading...` text. Do not double-submit (disable button clicking during loading).

---

## 2. Feedback Systems

* **Success Feedback**: Brief green flash or toast indicating successful database commits.
* **Error Feedback**: Keep errors inline or inside form headers. Display with a red text alert banner and a warning icon (`AlertTriangle`). Never show raw JS alerts.
* **Undo Completion**: Deleting a completed timeline item log shifts the item immediately back into its timeline bucket with a fast fade-out.

---

## 3. Keyboard Shortcuts & Controls

All modal components, commands panels, and sliders must support standard keyboard interactions:
- **`Escape`**: Closes the active Modal, Drawer, or Command Palette.
- **`Tab` / `Shift + Tab`**: Sequential focus through forms. Focus must never escape the boundary of an open Modal.
- **`Enter`**: Submits forms or triggers button commands.
- **Command Palette (`Ctrl + K` or `Cmd + K`)**: Globally displays search and command options.

---

## 4. Widget Transitions

- **Modals**: Fade in overlay, slide up modal container from bottom by 10px (`transition-all duration-200 ease-out`).
- **Drawers**: Slide in from the right edge (`translate-x-full` to `translate-x-0`) using standard decelerate transitions.
- **Timeline Items**: Checking/unchecking a checkbox executes a subtle height collapse and opacity change under 200ms duration.
