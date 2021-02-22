import { Album } from "./album";
import { SongBase } from "./songBase";
import { SongGroup } from "./songGroup";
import { Station } from "./station";
import { RainwaveTime } from "./time";

export interface SongOnAlbum extends SongBase {
  origin_sid: Station;
  added_on: RainwaveTime;
  cool_multiply?: number;
  cool_override?: number | null;
  requestable: boolean;
  cool: boolean;
  cool_end: number;
  request_only_end: number;
  request_only: boolean;
}

export interface AlbumWithDetail extends Album {
  genres: SongGroup[];
  rating_complete: boolean | null;
  rating_rank: number;
  rating_rank_percentile: number;
  request_count: number;
  request_rank: number;
  request_rank_percentile: number;
  rating_histogram: Record<string, number>;
  songs: SongOnAlbum[];
}
