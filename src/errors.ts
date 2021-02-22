class RainwaveSDKUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RainwaveSDKUsageError";
  }
}

export { RainwaveSDKUsageError };
