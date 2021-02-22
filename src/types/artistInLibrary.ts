import { Artist } from "./artist";

export interface ArtistInLibrary extends Artist {
  song_count: number;
}
