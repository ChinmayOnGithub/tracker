import { IRepository } from './IRepository';

export class RepositoryRegistry {
  private static registries: Map<string, IRepository<unknown>> = new Map();

  public static register<T>(key: string, repo: IRepository<T>) {
    this.registries.set(key, repo as unknown as IRepository<unknown>);
  }

  public static get<T>(key: string): IRepository<T> {
    const repo = this.registries.get(key);
    if (!repo) {
      throw new Error(`Repository "${key}" is not registered in RepositoryRegistry.`);
    }
    return repo as unknown as IRepository<T>;
  }
}
export default RepositoryRegistry;
