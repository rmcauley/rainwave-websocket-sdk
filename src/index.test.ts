import { RainwaveError } from "./errors";
import { Rainwave } from "./index";
import { Station } from "./types";

const userId = process.env.RWSDK_TEST_USER_ID
  ? parseInt(process.env.RWSDK_TEST_USER_ID, 10)
  : 1;
const apiKey = process.env.RWSDK_TEST_API_KEY || "";

describe("Rainwave SDK Connectivity", () => {
  test("resolves a promise on connection success", async () => {
    const rw = new Rainwave({
      userId,
      apiKey,
      sid: Station.all,
    });
    const connected = await rw.startWebSocketSync();
    await rw.stopWebSocketSync();
    expect(connected).toBe(true);
  });

  test("rejects a promise on connection failure", () => {
    expect.assertions(1);
    const rw = new Rainwave({
      userId,
      apiKey: apiKey + "aaaaaa",
      sid: Station.all,
    });
    return rw.startWebSocketSync().catch((error: unknown) => {
      if (!(error instanceof RainwaveError)) {
        throw new Error("SDK did not throw a RainwaveError.");
      }
      expect(error.key).toBe("auth_failed");
    });
  });
});

describe("Error Handling", () => {
  const rw = new Rainwave({
    userId,
    apiKey,
    sid: Station.all,
  });
  beforeAll(async () => {
    await rw.startWebSocketSync();
  });
  afterAll(async () => {
    await rw.stopWebSocketSync();
  });

  test("should resolve a request error with a rejected promise", () => {
    expect.assertions(3);
    return rw.request({ song_id: -1 }).catch((error: unknown) => {
      if (!(error instanceof RainwaveError)) {
        throw new Error("SDK did not throw a RainwaveError.");
      }
      expect(error.key).toBeDefined();
      expect(error.text).toBeDefined();
      expect(error.response).toBeDefined();
    });
  });
});

describe("Rainwave SDK API Calls", () => {
  // various IDs from production Rainwave
  const VALKYRIA_CHRONICLES_GROUP_ID = 1966;
  const BLADES_OF_STEEL_ALBUM_ID = 3492;
  const NIGHTS_ALBUM_ID = 495;
  const FAITH_IS_MY_PILLAR_SONG_ID = 7175;
  const SUBURBAN_MUSEUM_SONG_ID = 4804;
  const KOSHIRO_ARTIST_ID = 9140;

  const rw = new Rainwave({
    userId,
    apiKey,
    sid: Station.all,
  });
  beforeAll(async () => {
    await rw.startWebSocketSync();
    await rw.clearRequests();
  });
  afterAll(async () => {
    await rw.stopWebSocketSync();
  });

  test("album", async () => {
    const album = (await rw.album({ id: NIGHTS_ALBUM_ID })).album;
    expect(album.id).toBe(NIGHTS_ALBUM_ID);
  });

  test("artist", async () => {
    const artist = (await rw.artist({ id: KOSHIRO_ARTIST_ID })).artist;
    expect(artist.id).toBe(KOSHIRO_ARTIST_ID);
  });

  test("clearRating", async () => {
    const preRateResult = await rw.rate({
      song_id: FAITH_IS_MY_PILLAR_SONG_ID,
      rating: 5,
    });
    expect(preRateResult.rate_result.success).toBe(true);
    expect(preRateResult.rate_result.rating_user).toBe(5);
    const result = await rw.clearRating({ song_id: FAITH_IS_MY_PILLAR_SONG_ID });
    expect(result.rate_result.success).toBe(true);
    expect(result.rate_result.rating_user).toBeNull();
    const song = (await rw.song({ id: FAITH_IS_MY_PILLAR_SONG_ID })).song;
    expect(song.rating_user).toBeNull();
    const postRateResult = await rw.rate({
      song_id: FAITH_IS_MY_PILLAR_SONG_ID,
      rating: 5.0,
    });
    expect(postRateResult.rate_result.success).toBe(true);
    expect(postRateResult.rate_result.rating_user).toBe(5);
  });

  test("clearRequestsOnCooldown", async () => {
    const requests = (await rw.clearRequestsOnCooldown()).requests;
    expect(requests).toHaveLength(0);
  });

  test("request and deleteRequest", async () => {
    const requests = (await rw.request({ song_id: FAITH_IS_MY_PILLAR_SONG_ID })).requests;
    expect(requests).toHaveLength(1);
    expect(requests[0].id).toBe(FAITH_IS_MY_PILLAR_SONG_ID);
    const afterDeleteRequests = (
      await rw.deleteRequest({ song_id: FAITH_IS_MY_PILLAR_SONG_ID })
    ).requests;
    expect(afterDeleteRequests).toHaveLength(0);
  });

  test("faveAlbum", async () => {
    const faveResult = (
      await rw.faveAlbum({ album_id: BLADES_OF_STEEL_ALBUM_ID, fave: true })
    ).fave_album_result;
    expect(faveResult.success).toBe(true);
    expect(faveResult.fave).toBe(true);
    const unfaveResult = (
      await rw.faveAlbum({ album_id: BLADES_OF_STEEL_ALBUM_ID, fave: false })
    ).fave_album_result;
    expect(unfaveResult.success).toBe(true);
    expect(unfaveResult.fave).toBe(false);
  });

  test("faveAllSongs", async () => {
    const faveResult = (
      await rw.faveAllSongs({ album_id: BLADES_OF_STEEL_ALBUM_ID, fave: true })
    ).fave_all_songs_result;
    expect(faveResult.success).toBe(true);
    expect(faveResult.fave).toBe(true);
    expect(faveResult.song_ids).not.toHaveLength(0);
    const unfaveResult = (
      await rw.faveAllSongs({ album_id: BLADES_OF_STEEL_ALBUM_ID, fave: false })
    ).fave_all_songs_result;
    expect(unfaveResult.fave).toBe(false);
    expect(unfaveResult.song_ids.length).toBe(faveResult.song_ids.length);
  });

  test("faveSong", async () => {
    const faveResult = (
      await rw.faveSong({ song_id: FAITH_IS_MY_PILLAR_SONG_ID, fave: true })
    ).fave_song_result;
    expect(faveResult.success).toBe(true);
    expect(faveResult.fave).toBe(true);
    expect(faveResult.id).toBe(FAITH_IS_MY_PILLAR_SONG_ID);
    const unfaveResult = (
      await rw.faveSong({ song_id: FAITH_IS_MY_PILLAR_SONG_ID, fave: false })
    ).fave_song_result;
    expect(unfaveResult.success).toBe(true);
    expect(unfaveResult.fave).toBe(false);
    expect(unfaveResult.id).toBe(FAITH_IS_MY_PILLAR_SONG_ID);
  });

  test("group", async () => {
    const group = (await rw.group({ id: VALKYRIA_CHRONICLES_GROUP_ID })).group;
    expect(group.id).toBe(VALKYRIA_CHRONICLES_GROUP_ID);
  });

  test("infoAll", async () => {
    const infoAll = (await rw.infoAll()).all_stations_info;
    expect(infoAll[1]).toBeDefined();
  });

  test("listener", async () => {
    const listener = (await rw.listener({ id: userId })).listener;
    expect(listener.user_id).toBe(userId);
  });

  test("orderRequests", async () => {
    await rw.request({ song_id: FAITH_IS_MY_PILLAR_SONG_ID });
    await rw.request({ song_id: SUBURBAN_MUSEUM_SONG_ID });
    const result = await rw.orderRequests({
      order: [SUBURBAN_MUSEUM_SONG_ID, FAITH_IS_MY_PILLAR_SONG_ID],
    });
    const requests = result.requests;
    expect(result.order_requests_result.success).toBe(true);
    expect(requests[0].id).toBe(SUBURBAN_MUSEUM_SONG_ID);
    expect(requests[1].id).toBe(FAITH_IS_MY_PILLAR_SONG_ID);
    await rw.clearRequests();
  });

  test("pauseRequestQueue", async () => {
    const pause = await rw.pauseRequestQueue();
    expect(pause.pause_request_queue_result.success).toBe(true);
    expect(pause.user.requests_paused).toBe(true);
    const unpause = await rw.unpauseRequestQueue();
    expect(unpause.unpause_request_queue_result.success).toBe(true);
    expect(unpause.user.requests_paused).toBe(false);
  });

  test("playbackHistory", async () => {
    const result = await rw.playbackHistory();
    expect(result.playback_history.length).not.toBe(0);
    expect(result.playback_history[0].album_id).toBeDefined();
  });

  test("requestFavoritedSongs", async () => {
    const result = await rw.requestFavoritedSongs();
    expect(result.request_favorited_songs_result.success).toBe(true);
    expect(result.requests.length).not.toBe(0);
    expect(result.requests[0].id).toBeDefined();
    await rw.clearRequests();
  });

  test("requestLine", async () => {
    const line = (await rw.requestLine()).request_line_result;
    // entirely possible for line to be empty at any time
    expect(line).toBeDefined();
  });

  test("requestUnratedSongs", async () => {
    const result = await rw.requestUnratedSongs();
    expect(result.request_unrated_songs_result.success).toBe(true);
    expect(result.requests.length).not.toBe(0);
    expect(result.requests[0].id).toBeDefined();
    await rw.clearRequests();
  });

  test("search", async () => {
    const result = await rw.search({ search: "valkyria" });
    expect(result.albums.length).not.toBe(0);
  });

  test("song", async () => {
    const song = (await rw.song({ id: FAITH_IS_MY_PILLAR_SONG_ID })).song;
    expect(song.id).toBe(FAITH_IS_MY_PILLAR_SONG_ID);
  });

  test("stationSongCount", async () => {
    const songCount = (await rw.stationSongCount()).station_song_count;
    expect(songCount[0].song_count).not.toBe(0);
  });

  test("stations", async () => {
    const stations = (await rw.stations()).stations;
    expect(stations[0].id).toBeDefined();
  });

  test("top100", async () => {
    const top100 = (await rw.top100()).top_100;
    expect(top100.length).not.toBe(0);
  });

  test("unratedSongs", async () => {
    const unrated = (await rw.unratedSongs()).unrated_songs;
    expect(unrated.length).not.toBe(0);
  });

  test("userRecentVotes", async () => {
    const votes = (await rw.userRecentVotes()).user_recent_votes;
    expect(votes.length).not.toBe(0);
  });

  test("userRequestedHistory", async () => {
    const history = (await rw.userRequestedHistory()).user_requested_history;
    expect(history.length).not.toBe(0);
  });
});
