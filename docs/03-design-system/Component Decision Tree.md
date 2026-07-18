# Component Decision Tree

This document guides developers in selecting the correct layout wrapper for user interactions. It ensures consistent workflow hierarchy and reduces arbitrary popup layouts.

---

## 1. Decision Flowchart

When presenting information or collecting input, select the component using this logic path:

```
                  Is it navigation?
                      /      \
                   (Yes)     (No)
                    /          \
                 Drawer      Is it a quick, global shortcut action?
                                 /      \
                              (Yes)     (No)
                               /          \
                       Command Palette    Is it a full screen flow or deep page view?
                                              /      \
                                           (Yes)     (No)
                                            /          \
                                     Dedicated Page   Is it a complex editing/creation form?
                                                           /      \
                                                        (Yes)     (No)
                                                         /          \
                                                      Modal       Is it inline metadata/edit?
                                                                      /      \
                                                                   (Yes)     (No)
                                                                    /          \
                                                             Inline Editor    Is it contextual info?
                                                                                  /      \
                                                                               (Yes)     (No)
                                                                                /          \
                                                                            Popover      Tooltip / Toast
```

---

## 2. Selection Reference Guide

### Dedicated Page
* **Use Case**: Deep data views (e.g. secure vault items, archive logs), configuration hubs, or full-screen modules.
* **When NOT to use**: Small quick inputs, reminders updates, simple item additions.

### Modal
* **Use Case**: Creating or editing complex entities (e.g., adding an Activity Template), confirmation prompts, or detail summaries requiring user focus.
* **When NOT to use**: Contextual information, navigation menus, single-field inputs.
* **Rule**: Never nest a Modal inside another Modal.

### Drawer (Side Slide-In)
* **Use Case**: Date-specific detailed logs listing (e.g. calendar day click logs sheet), complex secondary panels, or mobile sidebar navigation.
* **When NOT to use**: Multi-field creation forms, simple delete confirmations.

### Command Palette
* **Use Case**: Global shortcut actions, jumping between panels, or quick keyword searches.
* **When NOT to use**: Multi-step configuration options.

### Popover (Dropdown / Contextual Overlay)
* **Use Case**: Action select menus, filter configurations, or priority pickers.
* **When NOT to use**: Detailed text editing.

### Tooltip / Toast
* **Use Case**: Displaying helper definitions (hover only) or temporary background success alerts.
* **When NOT to use**: Action selectors, multi-line blocks.
