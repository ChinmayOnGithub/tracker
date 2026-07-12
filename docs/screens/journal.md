# Screen Specification: Journal Panel

## 1. Purpose
Daily reflection hub for writing free-form notes, tracking daily moods, and logging structural summaries.

---

## 2. Layout & Structure
- **Layout**: Two-column desktop grid (left sidebar for entries history listing, right panel for editor window).
- **Mobile Mode**: Wraps to a single column view.

---

## 3. Core Components Used
- `<JournalPanel>`: Main wrapper.
- `<Textarea>`: Multi-line autosaving editor windows.
- `<Input>`: Entries search filters.
- `<Button>`: Add Entry, Back to list.

---

## 4. Allowed Interactions
- **Autosave**: Reflections and structured parameters are saved automatically 2.5 seconds after typing ceases.
- **Mood Pick**: Circular emojis highlight on click and save immediately.
- **History Search**: Search filters past entries.

---

## 5. Design Constraints (Forbidden Items)
- **No Manual Save Buttons**: Avoid "Save Reflection" buttons. Saving must always be transparently debounced and autosaved.
- **No Flashy Icons**: Keep mood picker and labels visually minimal.
- **No AI Prompts**: Do not include AI summaries or writing assistance.
