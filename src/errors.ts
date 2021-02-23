class RainwaveSDKUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RainwaveSDKUsageError";
  }
}

class RainwaveSDKInvalidRatingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RainwaveSDKInvalidRatingError";
  }
}

export { RainwaveSDKUsageError, RainwaveSDKInvalidRatingError };
