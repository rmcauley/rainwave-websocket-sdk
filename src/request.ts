import { RainwaveRequests } from "./requestTypes";
import { RainwaveResponseTypes } from "./responseTypes";
import { Station } from "./types/station";

export class RainwaveRequest<T extends keyof RainwaveRequests> {
  action: string;
  params: RainwaveRequests[T]["params"];
  messageId?: number;
  private _resolve: (data: RainwaveRequests[T]["response"]) => void;
  reject: (error: RainwaveResponseTypes["error"]) => void;

  constructor(
    action: string,
    params: RainwaveRequests[T]["params"],
    resolve: (data: RainwaveRequests[T]["response"]) => void,
    reject: (error: RainwaveResponseTypes["error"]) => void,
    messageId?: number
  ) {
    this.action = action;
    this.params = params;
    this._resolve = resolve;
    this.reject = reject;
    this.messageId = messageId;
  }

  apiMessage(sid: Station): Record<string, number | string> {
    const toReturn: Record<string, number | string> = {
      ...(this.params as Record<string, number | string>),
      sid,
      action: this.action,
    };
    if (this.messageId) {
      toReturn.message_id = this.messageId;
    }
    return toReturn;
  }

  resolve(data: Partial<RainwaveResponseTypes>): void {
    this._resolve(data as RainwaveRequests[T]["response"]);
  }
}
