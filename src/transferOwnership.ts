import { constants, Contract, ContractTransaction } from "ethers";

import { dim, cyan, green } from "./colors";

import hre from "hardhat";

const { ethers }: any = hre;

const { AddressZero }: any = constants;

export async function transferOwnership(
  name: string,
  contractAddress: string,
  contract: Contract | null,
  desiredOwner: string
): Promise<void> {
  if (!contract) {
    contract = await ethers.getContractAt(name, contractAddress);
  }

  const ownerIsSet = async (): Promise<boolean> => {
    const contractOwner: string = await contract?.owner();
    const pendingOwner: string = await contract?.pendingOwner();

    return contractOwner !== AddressZero || contractOwner == desiredOwner || pendingOwner == desiredOwner;
  };

  if (!(await ownerIsSet())) {
    cyan(`\nTransferring ${name} ownership to ${desiredOwner}...`);

    const tx: ContractTransaction = await contract?.transferOwnership(desiredOwner);

    await tx.wait(1);

    green(`Transfer complete!`);
  } else {
    dim(`\nOwner for ${name} has already been set`);
  }
}
