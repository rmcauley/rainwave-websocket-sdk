# Rainwave Websocket SDK

This SDK provides a typed interface to the public Rainwave Websocket API. It can be used in both browser and Node.js environments.

Once connected, the Rainwave SDK instance will emit events from the Rainwave Websocket.

## Example Implementations

TODO

## Installation

```
npm i rainwave-websocket-sdk
```

## Usage

Obtain your own API key and numeric User ID:

- [https://rainwave.cc/keys/](https://rainwave.cc/keys/)

Use them with the SDK:

```typescript
function logCurrentlyPlayingSong(rwEvent: RainwaveEvent): void {
  console.log(`${rwEvent.songs[0].albums[0].name} - ${rwEvent.songs[0].title}`);
}

const rw = new Rainwave({ userId: 2, apiKey: "ABC123456" });
rw.on("sched_current", logCurrentlyPlayingSong);
```
