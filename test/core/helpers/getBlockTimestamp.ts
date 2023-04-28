import { BigNumber } from "ethers";

import { ethers } from "hardhat";

export const getPreviousBlockTimestamp = async (): Promise<BigNumber> => {
  return BigNumber.from((await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp);
};

export const getBlockTimestamp = async (blockNumber: number): Promise<BigNumber> => {
  return BigNumber.from((await ethers.provider.getBlock(blockNumber)).timestamp);
};
