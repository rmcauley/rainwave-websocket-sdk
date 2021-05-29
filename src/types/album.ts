import { RatingUser } from ".";
import { AlbumArt } from "./albumArt";
import { RainwaveTime } from "./time";

export interface Album {
  added_on: RainwaveTime;
  art: AlbumArt;
  cool_lowest: RainwaveTime;
  /** @internal */
  cool_multiply?: number;
  /** @internal */
  cool_override?: number | null;
  cool: boolean;
  fave_count: number;
  fave: boolean | null;
  id: number;
  name: string;
  played_last: RainwaveTime;
  rating_count: number;
  rating_user: RatingUser;
  rating: number | null;
  request_count: number;
  song_count: number;
  vote_count: number;
}
