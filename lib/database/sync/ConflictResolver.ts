export interface ConflictContext<T> {
  entityId: string;
  localEntity: T & { updatedAt?: Date | string | null };
  remoteEntity: T & { updatedAt?: Date | string | null };
  localTimestamp?: Date;
  remoteTimestamp?: Date;
}

export interface IConflictResolver {
  resolve<T>(context: ConflictContext<T>): Promise<T>;
}

export class LastWriteWinsResolver implements IConflictResolver {
  public async resolve<T>(context: ConflictContext<T>): Promise<T> {
    const localTime = this.getTimestamp(context.localEntity, context.localTimestamp);
    const remoteTime = this.getTimestamp(context.remoteEntity, context.remoteTimestamp);

    if (localTime >= remoteTime) {
      return context.localEntity;
    }
    return context.remoteEntity;
  }

  private getTimestamp(entity: { updatedAt?: Date | string | null } | null | undefined, fallback?: Date): number {
    if (fallback) return fallback.getTime();
    if (entity && entity.updatedAt) {
      const parsed = new Date(entity.updatedAt);
      if (!isNaN(parsed.getTime())) return parsed.getTime();
    }
    return 0;
  }
}

export class ConflictResolver {
  private static activeResolver: IConflictResolver = new LastWriteWinsResolver();

  public static setResolver(resolver: IConflictResolver) {
    this.activeResolver = resolver;
  }

  public static async resolve<T>(context: ConflictContext<T>): Promise<T> {
    return this.activeResolver.resolve(context);
  }
}
