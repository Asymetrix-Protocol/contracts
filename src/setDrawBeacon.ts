import { Contract, ContractTransaction } from "ethers";

import { cyan, green } from "./colors";

import hardhat from "hardhat";

const { ethers } = hardhat;

export async function setDrawBeacon(
  drawBeaconAddress: string,
  stakePrizePoolAddress: string,
  contract?: Contract
): Promise<void> {
  if (!contract) {
    contract = await ethers.getContractAt("StakePrizePool", stakePrizePoolAddress);
  }

  if ((await contract.getDrawBeacon()) != drawBeaconAddress) {
    cyan("\nSetting Draw Beacon on Stake Prize Pool...");

    const tx: ContractTransaction = await contract.setDrawBeacon(drawBeaconAddress);

    await tx.wait(1);

    green(`Draw Beacon set!`);
  }
}
