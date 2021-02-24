/**
 * Base album art URL for Rainwave.
 *
 * Usage:
 *
 * ```typescript
 * const artLowRes = `https://rainwave.cc/${albumArt}_120.jpg`;
 * const artMedRes = `https://rainwave.cc/${albumArt}_240.jpg`;
 * const artMaxRes = `https://rainwave.cc/${albumArt}_320.jpg`;
 * if (!albumArt) {
 *   const backupArt = "https://rainwave.c/static/images4/noart_1.jpg";
 * }
 * ```
 */
export type AlbumArt = string | null;
