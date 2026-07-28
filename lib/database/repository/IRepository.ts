export interface IRepository<T> {
  getById(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  save(entity: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface ILocalRepository<T> {
  getById(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  save(entity: T): Promise<void>;
  saveAtomic(entity: T, queueItem: unknown): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAtomic(id: string, queueItem: unknown): Promise<void>;
}

export interface IRemoteRepository<T> {
  create(entity: T): Promise<unknown>;
  update(id: string, entity: Partial<T>): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}
