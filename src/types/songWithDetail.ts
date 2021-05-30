import { Album } from "./album";
import { AlbumWithDetail } from "./albumWithDetail";
import { Artist } from "./artist";
import { ElecBlockedBy } from "./elecBlockBy";
import { SongBase } from "./songBase";
import { SongGroup } from "./songGroup";
import { Station } from "./station";

export interface SongWithDetailArtist extends Artist {
  order: number;
}

export type SongWithDetailAlbum = Pick<
  Album,
  "id" | "rating" | "art" | "name" | "rating_user" | "fave"
> & {
  rating_complete: AlbumWithDetail["rating_complete"];
};

export interface SongWithDetail extends SongBase {
  album: [SongWithDetailAlbum];
  artists: SongWithDetailArtist[];
  cool: boolean;
  elec_blocked_by: ElecBlockedBy;
  elec_blocked: boolean;
  groups: SongGroup[];
  /** When on All, this is the station that the song comes from. */
  origin_sid: Station;
  rating_allowed: boolean;
  rating_count: number;
  rating_rank_percentile: number;
  rating_rank: number;
  request_count: number;
  request_rank_percentile: number;
  request_rank: number;
  sid: Station;
}
