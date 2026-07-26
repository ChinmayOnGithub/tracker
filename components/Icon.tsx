import React from 'react'
import * as Icons from 'lucide-react'

// Custom ISKCON-inspired Japa Mala SVG Icon
export const JapaMalaIcon: React.FC<{ className?: string; size?: number }> = ({ className = '', size = 20 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Circle loop of beads (prayer path) */}
      <circle cx="12" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      {/* Highlighted beads representation */}
      <circle cx="12" cy="3" r="1.1" fill="currentColor" />
      <circle cx="17.5" cy="8.5" r="1.1" fill="currentColor" />
      <circle cx="6.5" cy="8.5" r="1.1" fill="currentColor" />
      <circle cx="15.89" cy="4.61" r="1.1" fill="currentColor" />
      <circle cx="8.11" cy="4.61" r="1.1" fill="currentColor" />
      <circle cx="15.89" cy="12.39" r="1.1" fill="currentColor" />
      <circle cx="8.11" cy="12.39" r="1.1" fill="currentColor" />
      {/* Sumeru Bead (Guru bead) at the base */}
      <circle cx="12" cy="14" r="1.8" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
      {/* Tassel (traditional ISKCON silk thread tassel) */}
      <path d="M12 15.8v3.2" strokeWidth="2.2" stroke="currentColor" />
      <path d="M10.5 19c0-0.8 3-0.8 3 0v1.5c0 .4-.4.8-.8.8h-1.4c-.4 0-.8-.4-.8-.8V19z" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

// Map of user-friendly icon names to their Lucide components
export const ICON_OPTIONS = [
  { name: 'Activity', label: 'Activity/Pulse' },
  { name: 'Apple', label: 'Apple/Food' },
  { name: 'Bell', label: 'Reminder' },
  { name: 'Bicycle', label: 'Bicycle/Cycling' },
  { name: 'BookOpen', label: 'Journal/Reading' },
  { name: 'Brain', label: 'Brain/Mindfulness' },
  { name: 'Briefcase', label: 'Work/Career' },
  { name: 'Calendar', label: 'Event' },
  { name: 'Car', label: 'Car/Commute' },
  { name: 'CheckSquare', label: 'Task' },
  { name: 'Coffee', label: 'Habit/Leisure' },
  { name: 'DollarSign', label: 'Finance/Bills' },
  { name: 'Droplet', label: 'Wash/Grooming' },
  { name: 'Dumbbell', label: 'Fitness/Workout' },
  { name: 'FileText', label: 'File/Document' },
  { name: 'Flame', label: 'Flame/Energy' },
  { name: 'Fuel', label: 'Fuel/Gas Station' },
  { name: 'Gamepad', label: 'Gamepad/Gaming' },
  { name: 'Globe', label: 'Web/Domains' },
  { name: 'Heart', label: 'Health/Selfcare' },
  { name: 'Home', label: 'Home/Chores' },
  { name: 'JapaMala', label: 'Japa Mala (Prayer Beads)' },
  { name: 'Key', label: 'Key/Access' },
  { name: 'Laptop', label: 'Laptop/Work' },
  { name: 'Moon', label: 'Moon/Night' },
  { name: 'Music', label: 'Music/Spotify' },
  { name: 'PenTool', label: 'Pen/Creative' },
  { name: 'Phone', label: 'Phone/Calls' },
  { name: 'Pill', label: 'Medicine/Health' },
  { name: 'Plane', label: 'Plane/Travel' },
  { name: 'Scissors', label: 'Haircut/Grooming' },
  { name: 'ShoppingBag', label: 'Shopping/Groceries' },
  { name: 'ShowerHead', label: 'Shower/ShowerHead' },
  { name: 'Smile', label: 'Smile/Social' },
  { name: 'Sparkles', label: 'Sparkles/Special' },
  { name: 'Sun', label: 'Sun/Morning' },
  { name: 'Trash2', label: 'Trash/Clean' },
  { name: 'TrendingUp', label: 'Milestone' },
  { name: 'Tv', label: 'Tv/Movies' },
  { name: 'Users', label: 'Users/Family' },
  { name: 'Utensils', label: 'Utensils/Dining' },
  { name: 'Wifi', label: 'Wifi/Internet' },
  { name: 'Wrench', label: 'Wrench/Maintenance' },
]

export interface IconProps {
  name: string
  className?: string
  size?: number
}

export const Icon: React.FC<IconProps> = ({ name, className = '', size = 20 }) => {
  if (name === 'JapaMala') {
    return <JapaMalaIcon className={className} size={size} />
  }
  // Safe lookup: cast Icons to a record of components to avoid 'any'
  const iconSet = Icons as unknown as Record<
    string,
    React.ComponentType<{ className?: string; size?: number }>
  >
  const LucideIcon = iconSet[name] || Icons.CheckSquare
  return <LucideIcon className={className} size={size} />
}

