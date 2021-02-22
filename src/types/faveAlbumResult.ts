import { BooleanResult } from "./booleanResult";
import { Station } from "./station";

export interface FaveAlbumResult extends BooleanResult {
  id: number;
  fave: boolean;
  sid: Station;
}
