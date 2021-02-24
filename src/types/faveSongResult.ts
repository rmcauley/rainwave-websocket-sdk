import { BooleanResult } from "./booleanResult";
import { Station } from "./station";

export interface FaveSongResult extends BooleanResult {
  /** ID of Song that changed. */
  id: number;
  fave: boolean;
  sid: Station;
}
