import { Rainwave } from "./index";
import { RainwaveError, Station } from "./types";

const userId = process.env.RWSDK_TEST_USER_ID
  ? parseInt(process.env.RWSDK_TEST_USER_ID, 10)
  : 1;
const apiKey = process.env.RWSDK_TEST_API_KEY || "";

describe("RWSDK basics", () => {
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
    return rw.startWebSocketSync().catch((error: RainwaveError) => {
      expect(error.tl_key).toBe("auth_failed");
    });
  });
});
