// @ts-nocheck

import { Contract, ContractTransaction } from "ethers";

import { dim, cyan, green } from "./colors";

import hardhat from "hardhat";

const { ethers } = hardhat;

export async function setManager(
  name: string,
  contractAddress: string | null,
  contract: Contract | null,
  manager: string
): Promise<void> {
  if (!contract) {
    contract = await ethers.getContractAt(name, contractAddress);
  }

  if ((await contract.manager()) != manager) {
    cyan(`\nSetting ${name} manager`);

    const tx: ContractTransaction = await contract.setManager(manager);

    await tx.wait(1);

    green(`Manager set to ${manager}`);
  } else {
    dim(`\nManager for ${name} already set to ${manager}`);
  }
}
