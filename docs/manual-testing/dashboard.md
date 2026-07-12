# Today Dashboard — Manual Testing Checklist

Use this checklist to manually verify the layout, widgets, and behavior of the Tracker Today Dashboard.

---

## 1. Responsive Layout & Theme Validation

### A. Desktop Grid
- [ ] Log in and load the dashboard.
- [ ] Verify a 3-column responsive grid layout is rendered.
- [ ] Confirm no horizontal scrollbars exist on screen sizes $\ge 1024\text{px}$.

### B. Tablet & Mobile Layouts
- [ ] Resize the browser to a tablet width (between $768\text{px}$ and $1023\text{px}$). Verify a 2-column layout.
- [ ] Resize the browser to mobile width ($< 768\text{px}$). Verify a single-column layout where all widgets stack vertically.
- [ ] Scroll vertically and check that all widgets have natural spacing and clear margin boundaries.

### C. Theme Toggle
- [ ] Click the light/dark mode theme toggle.
- [ ] Verify colors change cleanly to match the design system tokens:
  - Dark mode: Zinc background, light text, dark border lines.
  - Light mode: Slate/white backgrounds, slate text, light border lines.

---

## 2. Widget Behavior & States

### A. Priority Schedule (Widget 1)
- [ ] **No Events Today**: Disconnect Google account (or check an empty day). Verify the priority schedule widget displays a compact message: `"No scheduled events today."`.
- [ ] **Upcoming Event**: Connect Google Calendar with an event in the future today. Verify the countdown (e.g. `"Starts in 45m"`) and time label are rendered correctly.
- [ ] **Active Event**: Start a meeting in Google Calendar. Verify the widget badge shifts to `"Active Now"` (green, pulsing) and the countdown shifts to `"Ends in Xm"`.
- [ ] **Location/Meeting link**: Add a location meeting URL (Google Meet / Zoom). Verify a prominent `"Join Meeting"` blue button is rendered. Add a physical location. Verify a location description with a MapPin is rendered.

### B. Today's Agenda (Widget 2)
- [ ] Verify all events scheduled for today appear in the timeline.
- [ ] Confirm past events (end time before now) are faded with `opacity-40`.
- [ ] Confirm the active event has a blue highlighted border and background.
- [ ] Click `"Open Calendar"`. Verify it redirects to the month calendar tab.

### C. Today's Habits (Widget 3)
- [ ] Verify only habits due today (according to recurrence rules) are listed.
- [ ] Click the checkmark box on a habit card.
- [ ] Verify the checkbox animates to a completed state, triggers a refresh, and the habit disappears from the "due" list (since its next due date shifts forward).
- [ ] Complete all habits. Verify the widget displays: `"You're all caught up on habits today! 🌟"`.

### D. Quick Actions (Widget 4)
- [ ] Click `"New Journal"`. Verify the day logs modal opens on the reflections/notes tab.
- [ ] Click `"New Event"`. Verify the new calendar event modal dialog appears. Fill out title/times and save. Verify the event appears immediately on Widget 1 and 2.
- [ ] Click `"Log Weight"`. Verify the placeholder dialog explaining body metric templates appears.
- [ ] Click `"Request Leave"`. Verify the placeholder dialog explaining leave integration appears.

### E. Daily Reflection (Widget 5)
- [ ] If no reflection is logged today, verify it displays: `"No reflection logged today"` with a `"Write Reflection"` button.
- [ ] Click `"Write Reflection"`. Type a title and content, and click save.
- [ ] Verify the widget updates to display the note title and content preview with an `"Edit Reflection"` button.

### F. Leave Allowances (Widget 6)
- [ ] Verify the leave summary placeholder lists Casual Leave, Sick Leave, and Paid Time Off balances correctly.

---

## 3. Resiliency & Network Failures

### A. Calendar API Failure
- [ ] Simulate network disconnect or cause Google API to fail.
- [ ] Verify Widget 1 and Widget 2 display a clear error warning and a `"Retry"` button.
- [ ] Verify Widget 3 (Habits) and Widget 5 (Journal) continue to work normally and can be checked off/edited.
