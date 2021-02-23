import { RainwaveSDKInvalidRatingError } from "src/errors";
import { RatingUser, ValidatedRatingUser } from "src/types/ratingUser";

function guardRatingUser(ratingUser: RatingUser): ValidatedRatingUser {
  if (ratingUser === 1) {
    return 1;
  } else if (ratingUser === 1.5) {
    return 1.5;
  } else if (ratingUser === 2) {
    return 2;
  } else if (ratingUser === 2.5) {
    return 2.5;
  } else if (ratingUser === 3) {
    return 3;
  } else if (ratingUser === 3.5) {
    return 3.5;
  } else if (ratingUser === 4) {
    return 4;
  } else if (ratingUser === 4.5) {
    return 4.5;
  } else if (ratingUser === 5) {
    return 5;
  }
  throw new RainwaveSDKInvalidRatingError(`${ratingUser}`);
}

/**
 * Takes a number and returns a type-guarded {@link ValidatedRatingUser}.
 *
 * Numbers below 1 are changed to 1.  Numbers above 5 are changed to 5.  Numbers in-between are rounded to their closest value in {@link ValidatedRatingUser}.
 *
 * @param ratingUser number
 */
export function getValidatedRatingUser(
  ratingUser: number
): ValidatedRatingUser {
  const clamped = Math.min(5, Math.max(1, ratingUser));
  const rounded = Math.round((clamped * 10) / 5) / 2;
  return guardRatingUser(rounded);
}
