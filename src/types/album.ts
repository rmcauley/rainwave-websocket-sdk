import { RainwaveTime } from "./time";

export interface Album {
  added_on: RainwaveTime;
  art: string | null;
  cool_lowest: RainwaveTime;
  cool_multiply: number;
  cool_override: number | null;
  cool: boolean;
  fave_count: number;
  fave: boolean | null;
  id: number;
  name: string;
  played_last: RainwaveTime;
  rating_count: number;
  rating_user: number | null;
  rating: number | null;
  request_count: number;
  song_count: number;
  vote_count: number;
  year: number | null;
}
