import WebSocket from "ws";

import { RainwaveCore, RainwaveOptions } from "./rainwave";

type RainwaveNode = RainwaveCore<
  WebSocket.MessageEvent,
  WebSocket.ErrorEvent,
  WebSocket.CloseEvent,
  WebSocket.OpenEvent,
  WebSocket
>;

function rainwaveNodeFactory(
  options: RainwaveOptions<WebSocket.ErrorEvent>
): RainwaveNode {
  const rw: RainwaveNode = new RainwaveCore(
    (url) => new WebSocket(url),
    (message: unknown) => (message as MessageEvent<WebSocket.Data>).data.toString(),
    options
  );
  return rw;
}

export { rainwaveNodeFactory as RainwaveNodeSDK };
export * from "./commonExports";
