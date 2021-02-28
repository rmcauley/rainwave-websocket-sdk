export function getSuccessFalse(obj: Record<string | number | symbol, unknown>): unknown {
  return Object.values(obj).find((result: unknown) => {
    if (result && typeof result === "object") {
      if ((result as Record<string, unknown>).success === false) {
        return true;
      }
    }
    return false;
  });
}
