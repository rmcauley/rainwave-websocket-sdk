import { Station } from "./station";
import { RainwaveTime } from "./time";

export interface User {
  admin: boolean;
  avatar?: string | null;
  id: number;
  listen_key: string | null;
  listener_id: number;
  lock_counter: number;
  lock_in_effect: boolean;
  lock_sid: Station | null;
  lock: boolean;
  name: string;
  new_privmsg: number;
  perks: boolean;
  rate_anything: boolean;
  request_expires_at: RainwaveTime;
  request_position: number;
  requests_paused: boolean;
  sid: Station;
  tuned_in: boolean;
  voted_entry: number;
}
