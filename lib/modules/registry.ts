import type { FeatureKey } from '@/lib/billing/types'
import type { TrackerCapability, TrackerModuleKey } from '@/lib/auth-policy'

export type DataIsolationMode =
  | 'user_isolated'   // Strict per-user isolation (e.g. Journal, Notes, Vault, Activities, Weight, Leave)
  | 'tenant_shared'   // Configurable shared workspace tools (e.g. Room turn, Shared finance)
  | 'owner_only'      // Restricted to system administrator / owner
  | 'system'          // Universal utility available to all authenticated sessions (e.g. Settings)

/**
 * Standardized module & feature specification template.
 * Any newly created feature or module registers here to automatically establish:
 * 1. Routing & navigation metadata
 * 2. Entitlement / tier requirements
 * 3. Data isolation mode
 * 4. Guest access defaults
 */
export interface ModuleDefinition {
  id: TrackerModuleKey
  name: string
  description: string
  route: string
  icon?: string
  // Entitlement & Tier requirements
  requiresPro?: boolean
  requiredCapability?: FeatureKey
  isSubscriberDefault?: boolean
  // Multi-user & Data isolation rules
  isolation: DataIsolationMode
  defaultGuestAccess: boolean
  // Associated capabilities
  capabilities?: TrackerCapability[]
  // Integration/App metadata
  appCategory?: 'core' | 'productivity' | 'health' | 'finance' | 'system'
}

/**
 * Single source of truth registry for all Tracker modules and features.
 */
const MODULE_REGISTRY: Map<TrackerModuleKey, ModuleDefinition> = new Map([
  [
    'today',
    {
      id: 'today',
      name: 'Today Overview',
      description: 'Daily dashboard, scheduled timeline occurrences, and activity checklist.',
      route: '/',
      isSubscriberDefault: true,
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      capabilities: ['work-hours.read', 'work-hours.write'],
      appCategory: 'core',
    },
  ],
  [
    'calendar',
    {
      id: 'calendar',
      name: 'Calendar',
      description: 'Two-way external Google Calendar synchronization and personal schedule planner.',
      route: '/calendar',
      requiresPro: true,
      requiredCapability: 'advanced_calendar',
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      capabilities: ['calendar.personal'],
      appCategory: 'productivity',
    },
  ],
  [
    'activities',
    {
      id: 'activities',
      name: 'Activities & Habits',
      description: 'Habit tracking, activity templates, streaks, and recurrence rules.',
      route: '/activities',
      isSubscriberDefault: true,
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      appCategory: 'core',
    },
  ],
  [
    'journal',
    {
      id: 'journal',
      name: 'Personal Journal',
      description: 'Private encrypted daily reflections, gratitude logs, and rich text notes.',
      route: '/journal',
      requiresPro: true,
      requiredCapability: 'advanced_journal',
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      capabilities: ['journal.read', 'journal.write'],
      appCategory: 'productivity',
    },
  ],
  [
    'notes',
    {
      id: 'notes',
      name: 'Notes & Thought Pad',
      description: 'Quick notes, scratchpad, and searchable markdown thoughts.',
      route: '/notes',
      requiresPro: true,
      requiredCapability: 'unlimited_notes',
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      appCategory: 'productivity',
    },
  ],
  [
    'leave',
    {
      id: 'leave',
      name: 'Time Off & Leave',
      description: 'Leave balance tracker, holiday calendar, and time off logs.',
      route: '/leave',
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      capabilities: ['leave.read', 'leave.write'],
      appCategory: 'productivity',
    },
  ],
  [
    'weight',
    {
      id: 'weight',
      name: 'Weight & Health Metrics',
      description: 'Body weight trends, health tracking, and target milestones.',
      route: '/weight',
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      capabilities: ['weight.read', 'weight.write'],
      appCategory: 'health',
    },
  ],
  [
    'links',
    {
      id: 'links',
      name: 'Link Library',
      description: 'Curated bookmarks, categorized resource collections, and quick links.',
      route: '/links',
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      appCategory: 'productivity',
    },
  ],
  [
    'documents',
    {
      id: 'documents',
      name: 'Secure Vault',
      description: 'Client-encrypted document storage, categorized folders, and bank details.',
      route: '/documents',
      requiresPro: true,
      requiredCapability: 'advanced_vault',
      isolation: 'user_isolated',
      defaultGuestAccess: false,
      capabilities: ['vault.read', 'vault.write'],
      appCategory: 'finance',
    },
  ],
  [
    'settings',
    {
      id: 'settings',
      name: 'Settings',
      description: 'User profile, appearance customization, security, integrations, and preferences.',
      route: '/settings',
      isolation: 'system',
      defaultGuestAccess: true,
      capabilities: ['settings.manage'],
      appCategory: 'system',
    },
  ],
])

/**
 * Retrieves the module definition for a given module key.
 */
export function getModuleDefinition(id: TrackerModuleKey): ModuleDefinition | undefined {
  return MODULE_REGISTRY.get(id)
}

/**
 * Returns all registered modules as an array.
 */
export function getAllModules(): ModuleDefinition[] {
  return Array.from(MODULE_REGISTRY.values())
}

/**
 * Dynamically registers a new module or feature definition.
 * Allows plugins or new modules to hook into authorization and isolation seamlessly.
 */
export function registerModule(definition: ModuleDefinition): void {
  MODULE_REGISTRY.set(definition.id, definition)
}

/**
 * Returns the required FeatureKey capability for a module, if any.
 */
export function getProCapabilityForModule(id: TrackerModuleKey): FeatureKey | undefined {
  const def = MODULE_REGISTRY.get(id)
  return def?.requiredCapability
}

/**
 * Checks whether a module is granted by default to all subscribed accounts.
 */
export function isSubscriberDefaultModule(id: TrackerModuleKey): boolean {
  const def = MODULE_REGISTRY.get(id)
  return Boolean(def?.isSubscriberDefault)
}

/**
 * Gets the isolation mode of a given module.
 */
export function getModuleIsolation(id: TrackerModuleKey): DataIsolationMode {
  const def = MODULE_REGISTRY.get(id)
  return def?.isolation || 'user_isolated'
}

/**
 * Returns all module keys that require Pro capabilities.
 */
export function getProCapabilityModules(): TrackerModuleKey[] {
  return Array.from(MODULE_REGISTRY.values())
    .filter(m => m.requiresPro)
    .map(m => m.id)
}
