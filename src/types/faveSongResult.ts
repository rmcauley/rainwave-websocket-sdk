import { BooleanResult } from "./booleanResult";
import { Station } from "./station";

export interface FaveSongResult extends BooleanResult {
  id: number;
  fave: boolean;
  sid: Station;
}
