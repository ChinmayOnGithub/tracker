export interface Note {
  id: string
  title: string | null
  content: string
  date: string
  userId?: string
  createdAt: Date | string
  updatedAt: Date | string
  deletedAt?: Date | string | null
}
