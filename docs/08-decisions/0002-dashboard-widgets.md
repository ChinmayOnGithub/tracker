# ADR 0002: Dashboard Widget Composition Architecture

## Context & Problem Statement
As Tracker scales to multiple domain areas (Habits, Workout, Leaves, Wishlists), the main dashboard page tends to grow in complexity, mixing query layouts, states, and business logic.

## Decision
The Dashboard is modeled as a widget host.
* The today view does not contain business logic.
* Every module registers its widgets adhering to a standard `DashboardWidgetProps` interface.
* Layout configurations (ordering, sizes, visibility) are persisted as a unified JSON block under `UserSetting`.

## Consequences
* **Positives**: Extreme modularity, pages remain plug-and-play, and layout configurations can easily scale to support customization (sizes, grid spans).
* **Negatives**: Requires state coordination interfaces if widgets need to trigger page-level modals.
