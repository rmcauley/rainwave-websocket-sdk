import { Album } from "./album";
import { AlbumWithDetail } from "./albumWithDetail";
import { ElecBlockedBy } from "./elecBlockBy";
import { SongBase } from "./songBase";
import { Station } from "./station";
import { RainwaveTime } from "./time";

export interface RequestAlbum {
  name: Album["name"];
  id: Album["id"];
  rating: Album["rating"];
  rating_user: Album["rating_user"];
  rating_complete: AlbumWithDetail["rating_complete"];
  art: Album["art"];
}

export interface Request extends SongBase {
  albums: [RequestAlbum];
  cool_end: RainwaveTime;
  cool: boolean;
  elec_blocked_by: ElecBlockedBy;
  elec_blocked_num: number | null;
  elec_blocked: boolean;
  /** Does the song still exist on the Rainwave? */
  good: boolean;
  order: number;
  /** When on All, this is the station that the song comes from. */
  origin_sid: Station;
  request_id: number;
  sid: Station;
  /** Does the song still exist on the {@link sid}? */
  valid: boolean;
}

export type Requests = Request[];
