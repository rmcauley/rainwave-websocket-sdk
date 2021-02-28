import { RainwaveResponseTypes } from "../responseTypes";
import { RainwaveError } from "../types";
import { getSuccessFalse } from "./getSuccessFalse";

export const RAINWAVE_ERROR_OBJECT_FLAG = "__rainwave_sdk_error__";

/**
 * Takes any error or objects and tries to find a Rainwave error or a Javascript error.
 *
 * @param error Any Rainwave or Javascript Error.
 */
export function getRainwaveError(
  error: unknown
): {
  /** Text in the user's language from the Rainwave server about the error, if there was a Rainwave error. */
  rainwaveErrorText?: string;
  /** Translation key from the Rainwave server corresponding to the error, if there was a Rainwave user.  Does not change with user's language. */
  rainwaveErrorTlKey?: string;
  /** Javascript error, if one happened. */
  error?: Error;
  /** Returned if the error was neither a Rainwave or a Javascript error. */
  unknown?: unknown;
} {
  if (error instanceof Error) {
    return {
      error,
    };
  }
  if (typeof error === "object") {
    if ((error as Record<string, unknown>)[RAINWAVE_ERROR_OBJECT_FLAG]) {
      const rainwaveResponse = error as Partial<RainwaveResponseTypes>;
      let rainwaveErrorText: string | undefined;
      let rainwaveErrorTlKey: string | undefined;
      if (rainwaveResponse.error) {
        rainwaveErrorText = rainwaveResponse.error.text;
        rainwaveErrorTlKey = rainwaveResponse.error.tl_key;
      } else {
        const successFalse = getSuccessFalse(rainwaveResponse);
        if (successFalse) {
          rainwaveErrorText = (successFalse as RainwaveError).text;
          rainwaveErrorTlKey = (successFalse as RainwaveError).tl_key;
        }
      }
      return {
        rainwaveErrorText,
        rainwaveErrorTlKey,
      };
    }
  }
  return {
    unknown: error,
  };
}
