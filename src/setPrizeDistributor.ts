import { Contract, ContractTransaction } from "ethers";

import { cyan, green } from "./colors";

import hardhat from "hardhat";

const { ethers } = hardhat;

export async function setPrizeDistributor(
  prizeDistributorAddress: string,
  drawBufferAddress: string,
  contract?: Contract
): Promise<void> {
  if (!contract) {
    contract = await ethers.getContractAt("DrawBuffer", drawBufferAddress);
  }

  if ((await contract.getPrizeDistributor()) != prizeDistributorAddress) {
    cyan("\nSetting Prize Distributor on Draw Buffer...");

    const tx: ContractTransaction = await contract.setPrizeDistributor(prizeDistributorAddress);

    await tx.wait(1);

    green(`Prize Distributor set!`);
  }
}
