import { BooleanResult } from "./booleanResult";

export interface VoteResult extends BooleanResult {
  elec_id: number;
  entry_id: number;
}
