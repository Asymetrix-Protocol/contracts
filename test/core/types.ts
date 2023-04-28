import { BigNumber } from "ethers";

export type Draw = {
  drawId: BigNumber;
  timestamp: BigNumber;
  beaconPeriodStartedAt: BigNumber;
  beaconPeriodSeconds: BigNumber;
  rngRequestInternalId: BigNumber;
  participantsHash: string;
  randomness: BigNumber[];
  picksNumber: BigNumber;
  isEmpty: boolean;
  paid: boolean;
};

export type PrizeDistribution = {
  numberOfPicks: BigNumber;
  startTimestampOffset: BigNumber;
  endTimestampOffset: BigNumber;
};

export type RngRequest = {
  id: BigNumber;
  lockBlock: BigNumber;
  requestedAt: BigNumber;
};
