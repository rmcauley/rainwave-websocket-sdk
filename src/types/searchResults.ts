import { Album } from "./album";
import { AlbumWithDetail } from "./albumWithDetail";
import { Artist } from "./artist";
import { SongBase } from "./songBase";
import { Station } from "./station";
import { RainwaveTime } from "./time";

export interface SearchAlbum {
  id: Album["id"];
  name: Album["name"];
  cool: boolean;
  rating: Album["rating"];
  fave: Album["fave"];
  rating_user: Album["rating_user"];
  rating_complete: AlbumWithDetail["rating_complete"];
}

export interface SearchArtist {
  id: Artist["id"];
  name: Artist["name"];
}

export interface SearchSong extends Omit<SongBase, "albums" | "artists"> {
  added_on: RainwaveTime;
  album_id: Album["id"];
  album_name: Album["name"];
  cool_end: RainwaveTime;
  cool: boolean;
  origin_sid: Station;
  requestable: boolean;
}

export interface SearchResult {
  albums: SearchAlbum[];
  artists: SearchArtist[];
  songs: SearchSong[];
}
