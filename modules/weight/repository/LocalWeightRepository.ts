import { BaseLocalRepository } from '@/lib/database/repository/BaseRepository';
import { WeightRecord } from '@/lib/store/store';
import { IWeightRepository } from './IWeightRepository';

export class LocalWeightRepository 
  extends BaseLocalRepository<WeightRecord> 
  implements IWeightRepository 
{
  constructor() {
    super('weight_records');
  }
}
export default LocalWeightRepository;
