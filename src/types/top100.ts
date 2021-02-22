import { Station } from "./station";

export interface Top100Song {
  album_name: string;
  id: number;
  origin_sid: Station;
  song_rating: number;
  song_rating_count: number;
  title: string;
}

export type Top100 = Top100Song[];
