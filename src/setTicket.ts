// @ts-nocheck

import { Contract, ContractTransaction } from "ethers";

import { cyan, green } from "./colors";

const { ethers } = hre;

export async function setTicket(
  ticketAddress: string,
  stakePrizePoolAddress: string,
  contract?: Contract
): Promise<void> {
  if (!contract) {
    contract = await ethers.getContractAt("StakePrizePool", stakePrizePoolAddress);
  }

  if ((await contract.getTicket()) != ticketAddress) {
    cyan("\nSetting Prize Ticket on Prize Pool...");

    const tx: ContractTransaction = await contract.setTicket(ticketAddress);

    await tx.wait(1);

    green(`Prize Ticket set!`);
  }
}
