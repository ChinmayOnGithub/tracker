import { BaseRepository } from '@/lib/database/repository/BaseRepository';
import { WeightRecord } from '@/lib/store/store';
import { IWeightRepository } from './IWeightRepository';
import { LocalWeightRepository } from './LocalWeightRepository';

export class WeightRepository 
  extends BaseRepository<WeightRecord> 
  implements IWeightRepository 
{
  constructor() {
    super(new LocalWeightRepository(), 'weight_records');
  }
}
export default WeightRepository;
