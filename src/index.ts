import NodeWebSocket from "ws";
import { RainwaveSDKUsageError } from "./errors";
import { RainwaveEventListener } from "./eventListener";
import { RainwaveRequest } from "./request";
import { RainwaveRequests } from "./requestTypes";
import { RainwaveResponseTypes } from "./responseTypes";
import { RainwaveError } from "./types/error";
import { Station } from "./types/station";

interface RainwaveOptions {
  userId: number;
  apiKey: string;
  sid: Station;
  url: string;
  debug: (msg: string | Error) => void;
  onSocketError: (event: Event) => void;
}

const PING_INTERVAL = 45000;
const WEBSOCKET_CHECK_TIMEOUT_MS = 3000;
const DEFAULT_RECONNECT_TIMEOUT = 500;
const STATELESS_REQUESTS = ["ping", "pong"];
const MAX_QUEUED_REQUESTS = 10;
const SINGLE_REQUEST_TIMEOUT = 4000;

export class Rainwave extends RainwaveEventListener<RainwaveResponseTypes> {
  private _userId: number;
  private _apiKey: string;
  private _sid: Station;
  private _url: string;
  private _debug: (msg: string) => void;
  private _externalOnSocketError: (event: Event) => void;
  private _socket?: NodeWebSocket | WebSocket;
  private _isOk?: boolean = false;
  private _socketTimeoutTimer: number | null = null;
  private _pingInterval: number | null = null;
  private _socketStaysClosed: boolean = false;
  private _socketIsBusy: boolean = false;

  private _currentScheduleId: number | undefined;
  private _requestId: number = 0;
  private _requestQueue: RainwaveRequest<keyof RainwaveRequests>[] = [];
  private _sentRequests: RainwaveRequest<keyof RainwaveRequests>[] = [];

  constructor(
    options: Partial<RainwaveOptions> &
      Pick<RainwaveOptions, "userId" | "apiKey" | "sid">
  ) {
    super();

    this._userId = options.userId;
    this._apiKey = options.apiKey;
    this._sid = options.sid;
    this._url = options.url || "wss://rainwave.cc/api4/websocket/";
    this._debug = options?.debug || ((): void => {});
    this._externalOnSocketError = options?.onSocketError || ((): void => {});

    this.on("wsok", this._onAuthenticationOK.bind(this));
    this.on("wserror", this._onAuthenticationFailure.bind(this));
    this.on("ping", this._onPing.bind(this));
  }

  private _getNextRequestId(): number {
    this._requestId += 1;
    return this._requestId;
  }

  // Socket Functions **************************************************************************************

  public startWebsocketSync(nodeSocket?: NodeWebSocket): void {
    if (this._socket?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this._socketTimeoutTimer) {
      clearTimeout(this._socketTimeoutTimer);
    }
    this._socketTimeoutTimer = (setTimeout(
      this._websocketCheck.bind(this),
      WEBSOCKET_CHECK_TIMEOUT_MS
    ) as unknown) as number;

    const socket =
      nodeSocket || new WebSocket(`${this._url}/websocket/${this._sid}`);
    socket.onmessage = this._onMessage.bind(this);
    socket.onclose = this._onSocketClose.bind(this);
    socket.onerror = this._onSocketError.bind(this);
    socket.onopen = this._onSocketOpen.bind(this);
    this._socket = socket;
  }

  public stopWebsocketSync(): void {
    if (
      !this._socket ||
      this._socket.readyState === WebSocket.CLOSING ||
      this._socket.readyState === WebSocket.CLOSED
    ) {
      return;
    }

    // sometimes depending on browser condition, onSocketClose won't get called for a while.
    // therefore it's important to clean here *and* in onSocketClose.
    this._cleanVariablesOnClose();
    this._socketStaysClosed = true;
    this._socket.close();
    this._debug("Socket closed.");
  }

  private _socketSend(message: unknown): void {
    if (!this._socket) {
      throw new RainwaveSDKUsageError(
        "Attempted to send to a disconnected socket."
      );
    }
    let jsonmsg: string;
    try {
      jsonmsg = JSON.stringify(message);
    } catch (error) {
      this.emit("sdk_exception", error);
      return;
    }
    try {
      this._socket.send(jsonmsg);
    } catch (error) {
      this.emit("sdk_exception", error);
    }
  }

  private _websocketCheck(): void {
    this._debug("Couldn't appear to connect.");
    this._reconnectSocket();
  }

  private _cleanVariablesOnClose(): void {
    this._isOk = false;
    if (this._socketTimeoutTimer) {
      clearTimeout(this._socketTimeoutTimer);
      this._socketTimeoutTimer = null;
    }
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  private _onSocketOpen(): void {
    this._debug("Socket open.");
    this._socketSend({
      action: "auth",
      user_id: this._userId,
      key: this._apiKey,
    });
  }

  private _onSocketClose(event?: Event): void {
    if (this._socketStaysClosed) {
      return;
    }

    this._debug("Socket was closed.");
    if (event) {
      this._onSocketError(event);
    }
    setTimeout(this.startWebsocketSync.bind(this), DEFAULT_RECONNECT_TIMEOUT);
  }

  private _onSocketError(event?: Event): void {
    this.emit("error", { code: 0, tl_key: "sync_retrying", text: "" });
    if (event) {
      this._externalOnSocketError(event);
    }
  }

  private _onAuthenticationOK(): void {
    this._debug("wsok received - auth was good!");
    this.emit("sdk_error_clear", { tl_key: "sync_retrying" });
    this._isOk = true;

    if (!this._pingInterval) {
      this._pingInterval = (setInterval(
        this._ping.bind(this),
        PING_INTERVAL
      ) as unknown) as number;
    }

    if (this._currentScheduleId) {
      this._socketSend({
        action: "check_sched_current_id",
        sched_id: this._currentScheduleId,
      });
    }

    this._nextRequest();
  }

  private _onAuthenticationFailure(error: RainwaveError): void {
    if (error.tl_key === "auth_failed") {
      this._debug(
        "Authorization failed for Rainwave websocket.  Wrong API key/user ID combo."
      );
      this.emit("error", error);
      this.stopWebsocketSync();
    }
  }

  // Error Handling ****************************************************************************************

  private _reconnectSocket(): void {
    if (this._socket) {
      // _onSocketClose will reconnect after the close is complete
      this._socket.close();
    }
  }

  // Ping and Pong *****************************************************************************************

  private _ping(): void {
    this._socketSend("ping");
  }

  private _onPing(): void {
    this._socketSend("pong");
  }

  // Data From API *****************************************************************************************

  private _onMessage(message: { data: string }): void {
    this.emit("sdk_error_clear", { tl_key: "sync_retrying" });
    if (this._socketTimeoutTimer) {
      clearTimeout(this._socketTimeoutTimer);
      this._socketTimeoutTimer = null;
    }

    let json: Partial<RainwaveResponseTypes>;
    try {
      json = JSON.parse(message.data) as Partial<RainwaveResponseTypes>;
    } catch (error) {
      this._debug(JSON.stringify(message));
      this._debug(error);
      this.emit("sdk_exception", error);
      this._reconnectSocket();
      return;
    }

    if (!json) {
      this._debug(JSON.stringify(message));
      this._debug("Response from Rainwave API was blank!");
      this._reconnectSocket();
    }

    const matchingSentRequest = this._sentRequests.find(
      (rq) => rq.messageId === json.message_id
    );

    if (matchingSentRequest) {
      this._sentRequests = this._sentRequests.filter(
        (rq) => rq.messageId !== json.message_id
      );
      if (json.error) {
        matchingSentRequest.reject(json.error);
      } else {
        matchingSentRequest.resolve(json);
      }
    }

    if (json.sync_result) {
      if (json.sync_result.tl_key === "station_offline") {
        this.emit("error", json.sync_result);
      } else {
        this.emit("sdk_error_clear", { tl_key: "station_offline" });
      }
    }

    this._performCallbacks(json);
    this._nextRequest();
  }

  // Calls To API ******************************************************************************************

  private _request(request: RainwaveRequest<keyof RainwaveRequests>): void {
    if (STATELESS_REQUESTS.indexOf(request.action) !== -1 || !this._isOk) {
      this._requestQueue = this._requestQueue.filter(
        (rq) => rq.action !== request.action
      );
    }
    this._requestQueue.push(request);
    if (!this._socketIsBusy && this._isOk) {
      this._nextRequest();
    }
  }

  private _nextRequest(): void {
    const request = this._requestQueue.shift();

    if (!request) {
      this._socketIsBusy = false;
      return;
    }
    if (!this._isOk) {
      return;
    }

    if (STATELESS_REQUESTS.indexOf(request.action) === -1) {
      request.messageId = this._getNextRequestId();
      if (this._sentRequests.length > MAX_QUEUED_REQUESTS) {
        this._sentRequests.splice(
          0,
          this._sentRequests.length - MAX_QUEUED_REQUESTS
        );
      }
    }

    if (this._socketTimeoutTimer) {
      clearTimeout(this._socketTimeoutTimer);
    }
    this._socketTimeoutTimer = (setTimeout(() => {
      this._onRequestTimeout(request);
    }, SINGLE_REQUEST_TIMEOUT) as unknown) as number;

    this._socketSend(request.apiMessage(this._sid));
    this._sentRequests.push(request);
  }

  private _onRequestTimeout(
    request: RainwaveRequest<keyof RainwaveRequests>
  ): void {
    if (this._socketTimeoutTimer) {
      this._socketTimeoutTimer = null;
      this._requestQueue.unshift(request);
      this._debug("Looks like the connection timed out.");
      this.emit("error", { code: 0, text: "", tl_key: "sync_retrying" });
      this._reconnectSocket();
    }
  }

  // Callback Handling *************************************************************************************

  private _performCallbacks(json: Partial<RainwaveResponseTypes>): void {
    // Make sure any vote results are registered after the schedule has been loaded.
    const alreadyVoted = json.already_voted;
    const liveVoting = json.live_voting;
    if (alreadyVoted) {
      delete json.already_voted;
    }
    if (liveVoting) {
      delete json.live_voting;
    }

    Object.keys(json).forEach((responseKey) => {
      const typedKey = responseKey as keyof RainwaveResponseTypes;
      this.emit(typedKey, json[typedKey]);
    });

    if ("sched_current" in json) {
      this.emit("sdk_schedule_synced", true);
    }

    if (alreadyVoted) {
      this.emit("already_voted", alreadyVoted);
    }

    if (liveVoting) {
      this.emit("live_voting", liveVoting);
    }
  }

  // API calls ***********************************************************************************************

  album(
    params: RainwaveRequests["album"]["params"]
  ): Promise<RainwaveRequests["album"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "album",
          params,
          (data) => resolve(data as RainwaveRequests["album"]["response"]),
          reject
        )
      );
    });
  }

  allAlbumsByCursor(): Promise<
    RainwaveRequests["all_albums_by_cursor"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "all_albums_by_cursor",
          { noSearchable: true },
          (data) =>
            resolve(
              data as RainwaveRequests["all_albums_by_cursor"]["response"]
            ),
          reject
        )
      );
    });
  }

  allArtists(): Promise<RainwaveRequests["all_artists"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "all_artists",
          { noSearchable: true },
          (data) =>
            resolve(data as RainwaveRequests["all_artists"]["response"]),
          reject
        )
      );
    });
  }

  allFaves(): Promise<RainwaveRequests["all_faves"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "all_faves",
          {},
          (data) => resolve(data as RainwaveRequests["all_faves"]["response"]),
          reject
        )
      );
    });
  }

  allGroups(): Promise<RainwaveRequests["all_groups"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "all_groups",
          { noSearchable: true },
          (data) => resolve(data as RainwaveRequests["all_groups"]["response"]),
          reject
        )
      );
    });
  }

  allSongs(
    params: RainwaveRequests["all_songs"]["params"]
  ): Promise<RainwaveRequests["all_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "all_songs",
          params,
          (data) => resolve(data as RainwaveRequests["all_songs"]["response"]),
          reject
        )
      );
    });
  }

  artist(
    params: RainwaveRequests["artist"]["params"]
  ): Promise<RainwaveRequests["artist"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "artist",
          params,
          (data) => resolve(data as RainwaveRequests["artist"]["response"]),
          reject
        )
      );
    });
  }

  clearRating(
    params: RainwaveRequests["clear_rating"]["params"]
  ): Promise<RainwaveRequests["clear_rating"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "clear_rating",
          params,
          (data) =>
            resolve(data as RainwaveRequests["clear_rating"]["response"]),
          reject
        )
      );
    });
  }

  clearRequests(): Promise<RainwaveRequests["clear_requests"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "clear_requests",
          {},
          (data) =>
            resolve(data as RainwaveRequests["clear_requests"]["response"]),
          reject
        )
      );
    });
  }

  clearRequestsOnCooldown(): Promise<
    RainwaveRequests["clear_requests_on_cooldown"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "clear_requests_on_cooldown",
          {},
          (data) =>
            resolve(
              data as RainwaveRequests["clear_requests_on_cooldown"]["response"]
            ),
          reject
        )
      );
    });
  }

  deleteRequest(
    params: RainwaveRequests["delete_request"]["params"]
  ): Promise<RainwaveRequests["delete_request"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "delete_requests",
          params,
          (data) =>
            resolve(data as RainwaveRequests["delete_request"]["response"]),
          reject
        )
      );
    });
  }

  faveAlbum(
    params: RainwaveRequests["fave_album"]["params"]
  ): Promise<RainwaveRequests["fave_album"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "fave_album",
          params,
          (data) => resolve(data as RainwaveRequests["fave_album"]["response"]),
          reject
        )
      );
    });
  }

  faveAllSongs(
    params: RainwaveRequests["fave_all_songs"]["params"]
  ): Promise<RainwaveRequests["fave_all_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "fave_all_songs",
          params,
          (data) =>
            resolve(data as RainwaveRequests["fave_all_songs"]["response"]),
          reject
        )
      );
    });
  }

  faveSong(
    params: RainwaveRequests["fave_song"]["params"]
  ): Promise<RainwaveRequests["fave_song"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "fave_song",
          params,
          (data) => resolve(data as RainwaveRequests["fave_song"]["response"]),
          reject
        )
      );
    });
  }

  group(
    params: RainwaveRequests["group"]["params"]
  ): Promise<RainwaveRequests["group"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "group",
          params,
          (data) => resolve(data as RainwaveRequests["group"]["response"]),
          reject
        )
      );
    });
  }

  infoAll(): Promise<RainwaveRequests["info_all"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "info_all",
          {},
          (data) => resolve(data as RainwaveRequests["info_all"]["response"]),
          reject
        )
      );
    });
  }

  listener(
    params: RainwaveRequests["listener"]["params"]
  ): Promise<RainwaveRequests["listener"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "listener",
          params,
          (data) => resolve(data as RainwaveRequests["listener"]["response"]),
          reject
        )
      );
    });
  }

  orderRequests(
    params: RainwaveRequests["order_requests"]["params"]
  ): Promise<RainwaveRequests["order_requests"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "order_requests",
          params,
          (data) =>
            resolve(data as RainwaveRequests["order_requests"]["response"]),
          reject
        )
      );
    });
  }

  pauseRequestQueue(): Promise<
    RainwaveRequests["pause_request_queue"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "pause_request_queue",
          {},
          (data) =>
            resolve(
              data as RainwaveRequests["pause_request_queue"]["response"]
            ),
          reject
        )
      );
    });
  }

  playbackHistory(): Promise<RainwaveRequests["playback_history"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "playback_history",
          {},
          (data) =>
            resolve(data as RainwaveRequests["playback_history"]["response"]),
          reject
        )
      );
    });
  }

  rate(
    params: RainwaveRequests["rate"]["params"]
  ): Promise<RainwaveRequests["rate"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "rate",
          params,
          (data) => resolve(data as RainwaveRequests["rate"]["response"]),
          reject
        )
      );
    });
  }

  request(
    params: RainwaveRequests["request"]["params"]
  ): Promise<RainwaveRequests["request"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "request",
          params,
          (data) => resolve(data as RainwaveRequests["request"]["response"]),
          reject
        )
      );
    });
  }

  requestFavoritedSongs(
    params: RainwaveRequests["request_favorited_songs"]["params"]
  ): Promise<RainwaveRequests["request_favorited_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "request_favorited_songs",
          params,
          (data) =>
            resolve(
              data as RainwaveRequests["request_favorited_songs"]["response"]
            ),
          reject
        )
      );
    });
  }

  requestLine(): Promise<RainwaveRequests["request_line"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "request_line",
          {},
          (data) =>
            resolve(data as RainwaveRequests["request_line"]["response"]),
          reject
        )
      );
    });
  }

  requestUnratedSongs(
    params: RainwaveRequests["request_unrated_songs"]["params"]
  ): Promise<RainwaveRequests["request_unrated_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "request_unrated_songs",
          params,
          (data) =>
            resolve(
              data as RainwaveRequests["request_unrated_songs"]["response"]
            ),
          reject
        )
      );
    });
  }

  search(
    params: RainwaveRequests["search"]["params"]
  ): Promise<RainwaveRequests["search"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "search",
          params,
          (data) => resolve(data as RainwaveRequests["search"]["response"]),
          reject
        )
      );
    });
  }

  song(
    params: RainwaveRequests["song"]["params"]
  ): Promise<RainwaveRequests["song"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "song",
          params,
          (data) => resolve(data as RainwaveRequests["song"]["response"]),
          reject
        )
      );
    });
  }

  stationSongCount(): Promise<
    RainwaveRequests["station_song_count"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "station_song_count",
          {},
          (data) =>
            resolve(data as RainwaveRequests["station_song_count"]["response"]),
          reject
        )
      );
    });
  }

  stations(): Promise<RainwaveRequests["stations"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "stations",
          {},
          (data) => resolve(data as RainwaveRequests["stations"]["response"]),
          reject
        )
      );
    });
  }

  top100(): Promise<RainwaveRequests["top_100"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "top_100",
          {},
          (data) => resolve(data as RainwaveRequests["top_100"]["response"]),
          reject
        )
      );
    });
  }

  unpauseRequestQueue(): Promise<
    RainwaveRequests["unpause_request_queue"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "unpause_request_queue",
          {},
          (data) =>
            resolve(
              data as RainwaveRequests["unpause_request_queue"]["response"]
            ),
          reject
        )
      );
    });
  }

  unratedSongs(): Promise<RainwaveRequests["unrated_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "unrated_songs",
          {},
          (data) =>
            resolve(data as RainwaveRequests["unrated_songs"]["response"]),
          reject
        )
      );
    });
  }

  userInfo(): Promise<RainwaveRequests["user_info"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "user_info",
          {},
          (data) => resolve(data as RainwaveRequests["user_info"]["response"]),
          reject
        )
      );
    });
  }

  userRecentVotes(): Promise<
    RainwaveRequests["user_recent_votes"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "user_recent_votes",
          {},
          (data) =>
            resolve(data as RainwaveRequests["user_recent_votes"]["response"]),
          reject
        )
      );
    });
  }

  userRequestedHistory(): Promise<
    RainwaveRequests["user_requested_history"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "user_requested_history",
          {},
          (data) =>
            resolve(
              data as RainwaveRequests["user_requested_history"]["response"]
            ),
          reject
        )
      );
    });
  }

  vote(
    params: RainwaveRequests["vote"]["params"]
  ): Promise<RainwaveRequests["vote"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "vote",
          params,
          (data) => resolve(data as RainwaveRequests["vote"]["response"]),
          reject
        )
      );
    });
  }
}
