import { Album } from "./album";

export type AlbumDiff = Omit<Album, "rating_user">[];
