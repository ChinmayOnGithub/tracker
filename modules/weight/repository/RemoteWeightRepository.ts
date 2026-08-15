import { BaseRemoteRepository } from '@/lib/database/repository/BaseRepository';
import { WeightRecord } from '@/lib/store/store';
import { logWeight, deleteWeightRecord } from '@/app/actions/weight';
import { toYMD, todayYMD } from '@/lib/dateUtils';

export class RemoteWeightRepository extends BaseRemoteRepository<WeightRecord> {
  public async create(entity: WeightRecord): Promise<unknown> {
    return logWeight(toYMD(entity.date), entity.weight, entity.notes);
  }

  public async update(_id: string, entity: Partial<WeightRecord>): Promise<unknown> {
    const dateStr = entity.date ? toYMD(entity.date) : todayYMD();
    const weightVal = entity.weight !== undefined ? entity.weight : 0;
    return logWeight(dateStr, weightVal, entity.notes);
  }

  public async delete(id: string): Promise<unknown> {
    return deleteWeightRecord(id);
  }
}
export default RemoteWeightRepository;
