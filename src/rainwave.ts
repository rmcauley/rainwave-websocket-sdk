import WebSocket from "ws";
import {
  RainwaveError,
  RainwaveSDKDisconnectedError,
  RainwaveSDKUsageError,
} from "./errors";
import { RainwaveEventListener } from "./eventListener";
import { RainwaveRequest } from "./request";
import { RainwaveRequests } from "./requestTypes";
import { RainwaveResponseTypes } from "./responseTypes";
import { Station } from "./types/station";
import { getSuccessFalse } from "./utils/getSuccessFalse";

const PING_INTERVAL = 45000;
const DEFAULT_RECONNECT_TIMEOUT = 500;
const STATELESS_REQUESTS = ["ping", "pong"];
const MAX_QUEUED_REQUESTS = 10;
const SINGLE_REQUEST_TIMEOUT = 4000;

type ErrorEvent = WebSocket.ErrorEvent;
type CloseEvent = WebSocket.CloseEvent;
type MessageEvent = WebSocket.MessageEvent;

type OnSocketErrorType = (event: ErrorEvent) => void;

class Rainwave extends RainwaveEventListener<RainwaveResponseTypes> {
  private _userId: number;
  private _apiKey: string;
  private _sid: Station;
  private _url: string;
  private _debug: (msg: string) => void;
  private _externalOnSocketError: OnSocketErrorType;
  private _socket?: WebSocket;
  private _isOk?: boolean = false;
  private _socketTimeoutTimer: number | null = null;
  private _pingInterval: number | null = null;
  private _socketStaysClosed: boolean = false;
  private _socketIsBusy: boolean = false;
  private _authPromiseResolve?: (authOk: boolean) => void;
  private _authPromiseReject?: (error: unknown) => void;

  private _currentScheduleId: number | undefined;
  private _requestId: number = 0;
  private _requestQueue: RainwaveRequest<keyof RainwaveRequests>[] = [];
  private _sentRequests: RainwaveRequest<keyof RainwaveRequests>[] = [];

  constructor(options: {
    userId: number;
    apiKey: string;
    sid: Station;
    /** @defaultValue "wss://rainwave.cc/api4/websocket/" */
    url?: string;
    debug?: (msg: string | Error) => void;
    onSocketError?: OnSocketErrorType;
  }) {
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
    this.on("sched_current", (current) => {
      this._currentScheduleId = current.id;
    });
  }

  private _getNextRequestId(): number {
    this._requestId += 1;
    return this._requestId;
  }

  // Socket Functions **************************************************************************************

  /**
   * Connect, authenticate, get current Rainwave status, and subscribe to Rainwave API events.
   *
   * @category Connection
   */
  public startWebSocketSync(): Promise<boolean> {
    if (this._socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }

    if (this._socketTimeoutTimer) {
      clearTimeout(this._socketTimeoutTimer);
    }

    const socket = new WebSocket(`${this._url}${this._sid}`);
    socket.onmessage = this._onMessage.bind(this);
    socket.onclose = this._onSocketClose.bind(this);
    socket.onerror = this._onSocketError.bind(this);
    socket.onopen = this._onSocketOpen.bind(this);
    this._socket = socket;

    return new Promise<boolean>((resolve, reject) => {
      this._authPromiseResolve = resolve;
      this._authPromiseReject = reject;
    });
  }

  /**
   * Disconnect from the Rainwave API.
   *
   * @category Connection
   */
  public stopWebSocketSync(): Promise<void> {
    if (
      !this._socket ||
      this._socket.readyState === WebSocket.CLOSING ||
      this._socket.readyState === WebSocket.CLOSED
    ) {
      return Promise.resolve();
    }

    this._socketStaysClosed = true;
    this._socket.close();
    this._debug("Socket closed by SDK.");
    return new Promise((resolve) => {
      this._authPromiseReject = (): void => resolve();
    });
  }

  private _cleanVariablesOnClose(event?: CloseEvent | ErrorEvent): void {
    if (event) {
      this._debug(JSON.stringify(Object.keys(event)));
    }
    this._isOk = false;
    if (this._socketTimeoutTimer) {
      clearTimeout(this._socketTimeoutTimer);
      this._socketTimeoutTimer = null;
    }
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
    if (this._authPromiseReject) {
      this._authPromiseReject(event);
    }
    this._authPromiseReject = undefined;
    this._authPromiseResolve = undefined;
    this._sentRequests.forEach((rwRequest) => {
      rwRequest.reject(new RainwaveSDKDisconnectedError("Socket closed."));
    });
    this._sentRequests = [];
  }

  private _onSocketClose(event: CloseEvent): void {
    const staysClosed = this._socketStaysClosed || !!this._authPromiseReject;
    this._cleanVariablesOnClose(event);
    if (staysClosed) {
      return;
    }

    this._debug("Socket closed on event.");
    setTimeout(() => {
      void this.startWebSocketSync();
    }, DEFAULT_RECONNECT_TIMEOUT);
  }

  private _onSocketError(event: ErrorEvent): void {
    this.emit("error", { code: 0, tl_key: "sync_retrying", text: "" });
    this._externalOnSocketError(event);
    this._socket?.close();
  }

  private _onSocketOpen(): void {
    this._socketSend({
      action: "auth",
      user_id: this._userId,
      key: this._apiKey,
    });
  }

  private _onAuthenticationOK(): void {
    this._debug("Rainwave connected successfully.");
    this.emit("sdk_error_clear", { tl_key: "sync_retrying" });
    this._isOk = true;

    if (!this._pingInterval) {
      this._pingInterval = (setInterval(
        this._ping.bind(this),
        PING_INTERVAL
      ) as unknown) as number;
    }

    this._socketSend({
      action: "check_sched_current_id",
      sched_id: this._currentScheduleId || 1,
    });

    this._nextRequest();

    if (this._authPromiseResolve) {
      this._authPromiseResolve(true);
      this._authPromiseResolve = undefined;
      this._authPromiseReject = undefined;
    }
  }

  private _onAuthenticationFailure(error: RainwaveResponseTypes["wserror"]): void {
    if (error.tl_key === "auth_failed") {
      this._debug(
        "Authorization failed for Rainwave websocket.  Wrong API key/user ID combo."
      );
      this.emit("error", error);
      if (this._authPromiseReject) {
        this._authPromiseReject(
          new RainwaveError(
            "Authentication failed.",
            { wserror: error },
            error.tl_key,
            error.text
          )
        );
        this._authPromiseReject = undefined;
        this._authPromiseResolve = undefined;
      }
      this._socketStaysClosed = true;
      this._socket?.close();
    }
  }

  private _socketSend(message: unknown): void {
    if (!this._socket) {
      throw new RainwaveSDKUsageError("Attempted to send to a disconnected socket.");
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

  private _onMessage(message: MessageEvent): void {
    this.emit("sdk_error_clear", { tl_key: "sync_retrying" });
    if (this._socketTimeoutTimer) {
      clearTimeout(this._socketTimeoutTimer);
      this._socketTimeoutTimer = null;
    }

    let json: Partial<RainwaveResponseTypes>;
    try {
      json = JSON.parse(message.data.toString()) as Partial<RainwaveResponseTypes>;
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
      return;
    }

    const matchingSentRequest = this._sentRequests.find(
      (rq) => rq.messageId === json.message_id?.message_id
    );

    if (matchingSentRequest) {
      this._sentRequests = this._sentRequests.filter(
        (rq) => rq.messageId !== json.message_id?.message_id
      );
      const successFalse = getSuccessFalse(json);
      if (successFalse) {
        matchingSentRequest.reject(
          new RainwaveError(
            successFalse.text,
            json,
            successFalse.tl_key,
            successFalse.text
          )
        );
      } else if (json.error) {
        matchingSentRequest.reject(
          new RainwaveError(json.error.text, json, json.error.tl_key, json.error.text)
        );
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
        this._sentRequests.splice(0, this._sentRequests.length - MAX_QUEUED_REQUESTS);
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

  private _onRequestTimeout(request: RainwaveRequest<keyof RainwaveRequests>): void {
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

  /**
   * Get detailed information about an album, including a list of songs in the album.
   *
   * @api4 album
   */
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

  /**
   * Gets a list of all albums on the server by page.
   *
   * @api4 all_albums_by_cursor
   */
  allAlbumsByCursor(): Promise<RainwaveRequests["all_albums_by_cursor"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "all_albums_by_cursor",
          { noSearchable: true },
          (data) => resolve(data as RainwaveRequests["all_albums_by_cursor"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Gets all artists from Rainwave in a single page.
   *
   * @api4 all_artists
   */
  allArtists(): Promise<RainwaveRequests["all_artists"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "all_artists",
          { noSearchable: true },
          (data) => resolve(data as RainwaveRequests["all_artists"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Get all songs that have been faved by the user by page.
   *
   * @api4 all_faves
   */
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

  /**
   * Get a list of all song groups on the station playlist in a single page.
   *
   * @api4 all_groups
   */
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

  /**
   * Gets every song including a user's ratings by page.
   *
   * @api4 all_songs
   */
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

  /**
   * Get detailed information about an artist.
   *
   * @api4 artist
   */
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

  /**
   * Remove a user's song rating.
   *
   * @api4 clear_rating
   */
  clearRating(
    params: RainwaveRequests["clear_rating"]["params"]
  ): Promise<RainwaveRequests["clear_rating"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "clear_rating",
          params,
          (data) => resolve(data as RainwaveRequests["clear_rating"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Clears all requests from the user's queue.
   *
   * @api4 clear_requests
   */
  clearRequests(): Promise<RainwaveRequests["clear_requests"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "clear_requests",
          {},
          (data) => resolve(data as RainwaveRequests["clear_requests"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Clears all requests from the user's queue that are on a cooldown of 20 minutes or more.
   *
   * @api4 clear_requests_on_cooldown
   */
  clearRequestsOnCooldown(): Promise<
    RainwaveRequests["clear_requests_on_cooldown"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "clear_requests_on_cooldown",
          {},
          (data) =>
            resolve(data as RainwaveRequests["clear_requests_on_cooldown"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Removes a request from the user's queue.
   *
   * @api4 delete_request
   */
  deleteRequest(
    params: RainwaveRequests["delete_request"]["params"]
  ): Promise<RainwaveRequests["delete_request"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "delete_request",
          params,
          (data) => resolve(data as RainwaveRequests["delete_request"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Fave or un-fave an album, specific to the station the request is being made on.
   *
   * @api4 fave_album
   */
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

  /**
   * Faves or un-faves all songs in an album. Only songs on the station the websocket is conneted to will be faved.
   *
   * @api4 fave_all_songs
   */
  faveAllSongs(
    params: RainwaveRequests["fave_all_songs"]["params"]
  ): Promise<RainwaveRequests["fave_all_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "fave_all_songs",
          params,
          (data) => resolve(data as RainwaveRequests["fave_all_songs"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Fave or un-fave a song.
   *
   * @api4 fave_song
   */
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

  /**
   * Get detailed information about a song group.
   *
   * @api4 group
   */
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

  /**
   * Returns a basic dict containing rudimentary information on what is currently playing on all stations.
   *
   * @api4 info_all
   */
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

  /**
   * Gets detailed information, such as favourite albums and rating histogram, on a particular user.
   *
   * @api4 listener
   */
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

  /**
   * Change the order of requests in the user's queue. Submit a comma-separated list of Song IDs, in desired order.
   *
   * @api4 order_requests
   */
  orderRequests(params: {
    order: number[];
  }): Promise<RainwaveRequests["order_requests"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "order_requests",
          {
            order: params.order.join(","),
          },
          (data) => resolve(data as RainwaveRequests["order_requests"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Stops the user from having their request queue processed while they're listening. Will remove them from the request line.
   *
   * @api4 pause_request_queue
   */
  pauseRequestQueue(): Promise<RainwaveRequests["pause_request_queue"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "pause_request_queue",
          {},
          (data) => resolve(data as RainwaveRequests["pause_request_queue"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Get the last 100 songs that played on the station.
   *
   * @api4 playback_history
   */
  playbackHistory(): Promise<RainwaveRequests["playback_history"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "playback_history",
          {},
          (data) => resolve(data as RainwaveRequests["playback_history"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Rate a song.
   *
   * For new users, the user must have been tuned in for this song to rate it, or they
   * must be tuned in if it's the currently playing song.
   *
   * For users who have rated 100 songs, they are allowed to rate any song at any time.
   *
   * Songs that are part of {@link RainwaveEventSong} have a `rating_allowed` property
   * you can use to check before submission if the user can rate.  For other songs, you
   * can use the `rate_anything` property of {@link User} to check before submission.
   * The API will return a {@link RainwaveErrorObject} if the user is not allowed to rate
   * the song yet.
   *
   * @api4 rate
   */
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

  /**
   * Submits a request for a song.
   *
   * @api4 request
   */
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

  /**
   * Fills the user's request queue with favorited songs.
   *
   * @api4 request_favorited_songs
   */
  requestFavoritedSongs(
    params: RainwaveRequests["request_favorited_songs"]["params"] = {}
  ): Promise<RainwaveRequests["request_favorited_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "request_favorited_songs",
          params,
          (data) =>
            resolve(data as RainwaveRequests["request_favorited_songs"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Gives a list of who is waiting in line to make a request on the given station,
   * plus their current top-requested song if they have one available.
   *
   * @api4 request_line
   */
  requestLine(): Promise<RainwaveRequests["request_line"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "request_line",
          {},
          (data) => resolve(data as RainwaveRequests["request_line"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Fills the user's request queue with unrated songs.
   *
   * @api4 request_unrated_songs
   */
  requestUnratedSongs(
    params: RainwaveRequests["request_unrated_songs"]["params"] = {}
  ): Promise<RainwaveRequests["request_unrated_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "request_unrated_songs",
          params,
          (data) =>
            resolve(data as RainwaveRequests["request_unrated_songs"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Search artists, albums, and songs for a matching string. Case insensitive.
   * Submitted string will be stripped of accents and punctuation.
   *
   * @api4 search
   */
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

  /**
   * Get detailed information about a song.
   *
   * @api4 song
   */
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

  /**
   * Get the total number of songs in the playlist on each station.
   *
   * @api4 station_song_count
   */
  stationSongCount(): Promise<RainwaveRequests["station_song_count"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "station_song_count",
          {},
          (data) => resolve(data as RainwaveRequests["station_song_count"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Get information about all available stations.
   *
   * @api4 stations
   */
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

  /**
   * Get the 100 highest-rated songs on the station the websocket is connected to.
   *
   * @api4 top_100
   */
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

  /**
   * Allows the user's request queue to continue being processed.
   * Adds the user back to the request line.
   *
   * @api4 unpause_request_queue
   */
  unpauseRequestQueue(): Promise<RainwaveRequests["unpause_request_queue"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "unpause_request_queue",
          {},
          (data) =>
            resolve(data as RainwaveRequests["unpause_request_queue"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Get all of a user's unrated songs by page.
   *
   * @api4 unrated_songs
   */
  unratedSongs(): Promise<RainwaveRequests["unrated_songs"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "unrated_songs",
          {},
          (data) => resolve(data as RainwaveRequests["unrated_songs"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Shows the songs the user recently voted for.
   *
   * @api4 user_recent_votes
   */
  userRecentVotes(): Promise<RainwaveRequests["user_recent_votes"]["response"]> {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "user_recent_votes",
          {},
          (data) => resolve(data as RainwaveRequests["user_recent_votes"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Shows requests of a user that were entered into an election.
   *
   * @api4 user_requested_history
   */
  userRequestedHistory(): Promise<
    RainwaveRequests["user_requested_history"]["response"]
  > {
    return new Promise((resolve, reject) => {
      this._request(
        new RainwaveRequest(
          "user_requested_history",
          {},
          (data) =>
            resolve(data as RainwaveRequests["user_requested_history"]["response"]),
          reject
        )
      );
    });
  }

  /**
   * Vote for a candidate in an election.
   *
   * If user has already voted, the vote will be changed to the submitted song.
   *
   * @api4 vote
   */
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

export { Rainwave };
