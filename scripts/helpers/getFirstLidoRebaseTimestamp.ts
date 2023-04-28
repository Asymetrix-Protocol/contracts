import moment from "moment-timezone";

import { BigNumber } from "ethers";

/*
 * Calculates the closest 12 PM UTC in the future from now.
 *
 * Examples:
 * 1) now - 8th February 7 AM UTC. The function will return the 8th February 12 PM UTC as the result.
 * 2) now - 8th February 1 PM UTC. The function will return the 9th February 12 PM UTC as the result.
 **/
export function getFirstLidoRebaseTimestamp(): BigNumber {
  // If now > today's 12 PM UTC
  if (moment().tz("UTC").unix() > moment().tz("UTC").startOf("day").hour(12).minute(0).unix()) {
    // Return next day's 12 PM UTC
    return BigNumber.from(moment().tz("UTC").endOf("day").add(1, "seconds").hour(12).minute(0).unix());
  }

  // Else return today's 12 PM UTC
  return BigNumber.from(moment().tz("UTC").startOf("day").hour(12).minute(0).unix());
}
