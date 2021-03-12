# Rainwave Websocket SDK

This SDK provides a typed interface to the public Rainwave Websocket API. It is currently only available in browser environments.

Once connected, the Rainwave SDK instance will emit events from the Rainwave Websocket.

## Installation

```
npm i rainwave-websocket-sdk
```

## Usage

Obtain your own API key and numeric User ID:

- [https://rainwave.cc/keys/](https://rainwave.cc/keys/)

Use them with the SDK:

```typescript
const rw = new Rainwave({
  apiKey: "aaaaaaaaa",
  userId: 2,
  sid: Station.game,
});
rw.on("sched_current", (current) => {
  console.log(`${current.songs[0].albums[0].name} - ${current.songs[0].title}`);
});
await rw.startWebSocketSync();
```

### Emitted Data Every Song Change

The following events are emitted by the API every song change as well as on connect, in
line with the REST `info` API call.

- `user`: {@link types.User}
- `album_diff`: {@link types.AlbumDiff}
- `request_line`: {@link types.RequestLine}
- `sched_current`: {@link types.RainwaveEvent}
- `sched_next`: An array of {@link types.RainwaveEvent}
- `sched_history`: An array of {@link types.RainwaveEvent}
- `all_stations_info`: {@link types.AllStationsInfo}

### Examples

- [Write On Song Change](https://github.com/rmcauley/rainwave-write-on-song-change)
