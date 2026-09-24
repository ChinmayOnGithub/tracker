// design-system/index.ts
// Canonical exports for Tracker OS Design System

// Core Primitives
export { Button } from './components/Button'
export type { ButtonVariant, ButtonSize, ButtonProps } from './components/Button'
export { Card, CardHeader, CardBody, CardFooter } from './components/Card'
export { Surface, SurfaceHeader, SurfaceContent, SurfaceFooter } from './components/Surface'
export type { SurfaceVariant, SurfaceProps } from './components/Surface'
export { Input, Textarea, Select } from './components/Input'
export { SearchInput } from './components/SearchInput'
export { FormField, FormLabel, FormControl, FormDescription, FormError } from './components/FormField'
export { Modal } from './components/Modal'
export { EmptyState } from './components/EmptyState'
export type { EmptyStateProps } from './components/EmptyState'
export { ErrorState, InlineError, FormError as FormErrorMessage } from './components/ErrorState'
export type { ErrorStateProps, InlineErrorProps, FormErrorProps } from './components/ErrorState'
export {
  Skeleton,
  SkeletonWidget,
  PageSkeleton,
  SectionSkeleton,
  ListSkeleton,
  CardSkeleton,
  TableSkeleton,
} from './components/Skeleton'
export { Badge } from './components/Badge'
export type { BadgeVariant, BadgeSize, BadgeProps } from './components/Badge'
export { Checkbox } from './components/Checkbox'
export { Dropdown } from './components/Dropdown'
export type { DropdownItem, DropdownSeparator, DropdownOption } from './components/Dropdown'
export { Tabs, TabsList, Tab, TabsContent } from './components/Tabs'
export { ToastProvider, useToast } from './components/Toast'
export type { ToastVariant, ToastItem } from './components/Toast'

// Radix Primitives
export * from './components/Dialog'
export * from './components/Sheet'
export * from './components/Popover'
export * from './components/DropdownMenu'
export * from './components/Tooltip'
export { Switch } from './components/Switch'

// Layout & Composite Components
export { PageContainer } from './components/PageContainer'
export { PageHeader } from './components/PageHeader'
export { SectionHeader } from './components/SectionHeader'
export type { SectionHeaderProps } from './components/SectionHeader'
export { Section } from './components/Section'
export { ListRow } from './components/ListRow'
export { List, ListItem, ListItemLeading, ListItemContent, ListItemTrailing } from './components/List'
export type { ListProps, ListItemProps } from './components/List'
export { IconButton } from './components/IconButton'
export { StatusBadge } from './components/StatusBadge'
export { ConfirmDialog } from './components/ConfirmDialog'
export { ActionSheet } from './components/ActionSheet'
export { PageShell } from './components/PageShell'
