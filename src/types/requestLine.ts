import { RainwaveTime } from "./time";

export interface RequestLineEntry {
  username: string;
  user_id: number;
  line_expiry_tune_in: RainwaveTime;
  line_expiry_election: RainwaveTime;
  line_wait_start: RainwaveTime;
  line_has_had_valid: boolean;
  song_id: number | null;
  skip: boolean;
  position: number;
}

export type RequestLine = RequestLineEntry[];
