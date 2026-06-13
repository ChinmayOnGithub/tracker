export interface CalendarEvent {
  date: string; // YYYY-MM-DD
  title: string;
  type: 'chaturthi' | 'festival';
  isAngaraki?: boolean;
}

export const marathiCalendarEvents: CalendarEvent[] = [
  // 2026 Sankashti Chaturthi
  { date: '2026-01-06', title: 'Angarak Sankashti Chaturthi', type: 'chaturthi', isAngaraki: true },
  { date: '2026-02-05', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-03-06', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-04-05', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-05-05', title: 'Angarak Sankashti Chaturthi', type: 'chaturthi', isAngaraki: true },
  { date: '2026-06-04', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-07-03', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-08-02', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-08-31', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-09-29', title: 'Angarak Sankashti Chaturthi', type: 'chaturthi', isAngaraki: true },
  { date: '2026-10-29', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-11-27', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2026-12-26', title: 'Sankashti Chaturthi', type: 'chaturthi' },

  // 2026 Marathi Festivals
  { date: '2026-03-19', title: 'Gudi Padwa (Marathi New Year) 🚩', type: 'festival' },
  { date: '2026-09-14', title: 'Ganesh Chaturthi 🌸', type: 'festival' },
  { date: '2026-11-08', title: 'Diwali (Lakshmi Puja) 🪔', type: 'festival' },

  // 2027 Sankashti Chaturthi
  { date: '2027-01-25', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-02-24', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-03-25', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-04-24', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-05-23', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-06-22', title: 'Angaraki Sankashti Chaturthi', type: 'chaturthi', isAngaraki: true },
  { date: '2027-07-22', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-08-20', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-09-19', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-10-18', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-11-17', title: 'Sankashti Chaturthi', type: 'chaturthi' },
  { date: '2027-12-16', title: 'Sankashti Chaturthi', type: 'chaturthi' },

  // 2027 Marathi Festivals
  { date: '2027-04-07', title: 'Gudi Padwa (Marathi New Year) 🚩', type: 'festival' },
  { date: '2027-09-04', title: 'Ganesh Chaturthi 🌸', type: 'festival' },
  { date: '2027-10-29', title: 'Diwali (Lakshmi Puja) 🪔', type: 'festival' },
];

/**
 * Returns any Marathi calendar events occurring on the specified date (YYYY-MM-DD)
 */
export function getEventsForDate(dateStr: string): CalendarEvent[] {
  return marathiCalendarEvents.filter(event => event.date === dateStr);
}

/**
 * Returns upcoming events relative to referenceDateStr (inclusive), sorted chronologically.
 */
export function getUpcomingEvents(referenceDateStr: string, limit: number = 5): CalendarEvent[] {
  return marathiCalendarEvents
    .filter(event => event.date >= referenceDateStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}
