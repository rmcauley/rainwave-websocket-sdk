import { Album } from "./album";
import { AlbumWithDetail } from "./albumWithDetail";
import { RainwaveTime } from "./time";

export interface AlbumInList {
  id: Album["id"];
  name: Album["name"];
  rating: Album["rating"];
  cool: boolean;
  cool_lowest: RainwaveTime;
  fave: Album["fave"];
  rating_user: Album["rating_user"];
  rating_complete: AlbumWithDetail["rating_complete"];
  newest_song_time: RainwaveTime;
}

export type AllAlbums = AlbumInList[];
