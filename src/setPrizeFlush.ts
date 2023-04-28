import { Contract, ContractTransaction } from "ethers";

import { cyan, green } from "./colors";

import hardhat from "hardhat";

const { ethers } = hardhat;

export async function setPrizeFlush(
  prizeFlushAddress: string,
  stakePrizePoolAddress: string,
  contract?: Contract
): Promise<void> {
  if (!contract) {
    contract = await ethers.getContractAt("StakePrizePool", stakePrizePoolAddress);
  }

  if ((await contract.getPrizeFlush()) != prizeFlushAddress) {
    cyan("\nSetting Prize Flush on Prize Pool...");

    const tx: ContractTransaction = await contract.setPrizeFlush(prizeFlushAddress);

    await tx.wait(1);

    green(`Prize Flush set!`);
  }
}
