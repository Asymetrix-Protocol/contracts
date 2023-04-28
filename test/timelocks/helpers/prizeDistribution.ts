import { BigNumber } from "@ethersproject/bignumber";

import { ethers } from "hardhat";

type PrizeDistribution = {
  numberOfPicks: BigNumber;
  startTimestampOffset: BigNumber;
  endTimestampOffset: BigNumber;
};

const prizeDistribution: PrizeDistribution = {
  numberOfPicks: ethers.utils.parseEther("1"),
  startTimestampOffset: BigNumber.from(0),
  endTimestampOffset: BigNumber.from(3600),
};

export const newPrizeDistribution = (): any => {
  return {
    ...prizeDistribution,
  };
};
