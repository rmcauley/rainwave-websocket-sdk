# API Reference

- {@link RainwaveCore} for API calls and SDK functions
- {@link RainwaveResponseTypes} for the return types of the API

&nbsp;

# SDK

The SDK provides a typed interface to the public Rainwave Websocket API.

Once connected, the Rainwave SDK instance will emit events from the Rainwave Websocket.

## SDK Installation

```
npm i rainwave-websocket-sdk
```

## Obtaining Your API Key from Rainwave

Obtain your own API key and numeric User ID from here to use in the SDK:

- [https://rainwave.cc/keys/](https://rainwave.cc/keys/)

## SDK Usage In Node

Use the `rainwave/node` entry point to include the WebSockets library:

```typescript
import { RainwaveNodeSDK, Station } from "rainwave/node";

const rw = RainwaveNodeSDK({
  apiKey: "aaaaaaaaa",
  userId: 2,
  sid: Station.game,
});
rw.on("sched_current", (current) => {
  console.log(`${current.songs[0].albums[0].name} - ${current.songs[0].title}`);
});
await rw.startWebSocketSync();
```

## SDK Usage In Web Browsers

Using the `rainwave/web` entry point will omit the Node `websockets` library from your bundle:

```typescript
import { RainwaveWebSDK, Station } from "rainwave/web";

const rw = RainwaveWebSDK({
  apiKey: "aaaaaaaaa",
  userId: 2,
  sid: Station.game,
});
rw.on("sched_current", (current) => {
  console.log(`${current.songs[0].albums[0].name} - ${current.songs[0].title}`);
});
rw.startWebSocketSync();
```

### SDK Examples

- [Write On Song Change](https://github.com/rmcauley/rainwave-write-on-song-change)

### Emitted Data By API Every Song Change

The following events are emitted by the API when you connect, and on every song change:

- `user`: {@link types.User}
- `album_diff`: {@link types.AlbumDiff}
- `request_line`: {@link types.RequestLine}
- `sched_current`: {@link types.RainwaveEvent}
- `sched_next`: An array of {@link types.RainwaveEvent}
- `sched_history`: An array of {@link types.RainwaveEvent}
- `all_stations_info`: {@link types.AllStationsInfo}
