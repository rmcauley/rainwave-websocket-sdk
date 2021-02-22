import { RainwaveEvent } from "./rainwaveEvent";
import { Station } from "./station";

export interface StationInfo {
  title: string;
  album: string;
  art: string | null;
  event_name: string | null;
  event_type: RainwaveEvent["type"];
}

export type AllStationsInfo = Record<Station, StationInfo>;
