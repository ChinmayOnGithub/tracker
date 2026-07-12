# User Experience (UX) Architecture Rules

This document outlines the strict usability principles, navigation boundaries, and interaction logic constraints for Tracker OS.

---

## 1. Core UX Laws

* **One Primary Question Per Page**: Every view must resolve one major query.
  - Today dashboard: *"What do I need to focus on right now?"*
  - Calendar panel: *"What is my scheduling commitments over the next few weeks?"*
  - Settings panel: *"Are my integrations connected and healthy?"*
* **Maximum Two Primary Actions**: No screen may present more than two primary action buttons (high contrast solid colors). All other options must be styled as secondary (borders only) or tertiary (links/icons only).
* **No Nested Modals**: Never launch a modal dialog on top of another open modal. If a nested action is needed, use inline expansions, popovers, or navigate to a dedicated detail page.
* **No Multi-step Wizards**: Avoid dividing forms into sequential step wizard screens. Prefer unified, single-scroll layouts with clear collapsible progressive disclosure accordions.
* **Progressive Disclosure**: Default views must hide technical configuration metadata. Always group advanced fields (e.g. reminder rules, sync targets, raw parameters) inside an "Advanced Options" toggle header.

---

## 2. Interactive Friction Controls

* **The Three-Click Rule**: No common workflow (e.g. logging weight, creating a task, writing a journal entry, changing view parameters) should require more than three clicks.
* **Actionable Cards Only**: Cards must never act as simple static placeholders or text billboards. Every card container must display actionable data, list items, or toggle controls.
* **Inline Editing Over Forms**: For simple updates (like changing a task note or writing reflections), prefer direct inline editing textareas with debounced auto-saving over opening confirmation modal forms.
* **Instant Interaction Feedback**: Every action (checking a checkbox, pressing a button, deleting a log) must respond instantly with visible cues (pulse, fade, change of state, or disabling cursor actions). Never leave the user guessing if an action registered.
