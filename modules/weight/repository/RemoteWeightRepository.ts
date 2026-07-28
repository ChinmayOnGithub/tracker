import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { WeightRecord } from '@/lib/store/store';
import { logWeight, deleteWeightRecord } from '@/app/actions/weight';

export class RemoteWeightRepository extends BaseRemoteRepository<WeightRecord> {
  public async create(entity: WeightRecord): Promise<unknown> {
    const dateStr = typeof entity.date === 'string' 
      ? entity.date.split('T')[0]
      : new Date(entity.date).toISOString().split('T')[0];
    return logWeight(dateStr, entity.weight, entity.notes);
  }

  public async update(_id: string, entity: Partial<WeightRecord>): Promise<unknown> {
    const dateStr = entity.date
      ? (typeof entity.date === 'string' ? entity.date.split('T')[0] : new Date(entity.date).toISOString().split('T')[0])
      : new Date().toISOString().split('T')[0];
    const weightVal = entity.weight !== undefined ? entity.weight : 0;
    return logWeight(dateStr, weightVal, entity.notes);
  }

  public async delete(id: string): Promise<unknown> {
    return deleteWeightRecord(id);
  }
}
export default RemoteWeightRepository;
