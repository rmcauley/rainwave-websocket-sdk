import { RainwaveCore, RainwaveOptions } from "./rainwave";

class RainwaveWebSocket {
  OPEN = WebSocket.OPEN;
  CLOSED = WebSocket.CLOSED;
  CLOSING = WebSocket.CLOSING;
  private _ws: WebSocket;

  constructor(url: string) {
    this._ws = new WebSocket(url);
  }

  close(): void {
    this._ws.close();
  }

  send(message: string): void {
    this._ws.send(message);
  }

  set onmessage(func: (msg: MessageEvent) => void) {
    this._ws.onmessage = func;
  }

  set onerror(func: (evt: Event) => void) {
    this._ws.onerror = func;
  }

  set onopen(func: (evt: Event) => void) {
    this._ws.onopen = func;
  }

  set onclose(func: (evt: CloseEvent) => void) {
    this._ws.onclose = func;
  }

  get readyState(): number {
    return this._ws.readyState;
  }
}

type RainwaveWeb = RainwaveCore<
  MessageEvent,
  Event,
  CloseEvent,
  Event,
  RainwaveWebSocket
>;

function rainwaveWebFactory(options: RainwaveOptions<Event>): RainwaveWeb {
  const rw: RainwaveWeb = new RainwaveCore(
    (url) => new RainwaveWebSocket(url),
    (message) => (message as MessageEvent).data as string,
    options
  );
  return rw;
}

export { rainwaveWebFactory as RainwaveWebSDK };
export * from "./commonExports";
