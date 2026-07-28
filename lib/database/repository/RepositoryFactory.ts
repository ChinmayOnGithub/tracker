import { IRepository } from './IRepository';
import { BaseRepository, BaseLocalRepository } from './BaseRepository';
import { RepositoryRegistry } from './RepositoryRegistry';

export class RepositoryFactory {
  public static create<T extends { id: string }>(
    key: string,
    storeName: string,
    moduleName: string
  ): IRepository<T> {
    try {
      return RepositoryRegistry.get<T>(key);
    } catch {
      const local = new BaseLocalRepository<T>(storeName);
      const repo = new BaseRepository<T>(local, moduleName);
      RepositoryRegistry.register(key, repo);
      return repo;
    }
  }
}
export default RepositoryFactory;
