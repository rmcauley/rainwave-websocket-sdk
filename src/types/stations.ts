import { Relays } from "./relays";
import { Station } from "./station";

export interface StationDescription {
  description: string;
  id: Station;
  name: string;
  relays: Relays;
  stream: string;
}

export type Stations = StationDescription[];
