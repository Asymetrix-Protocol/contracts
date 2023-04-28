import { createContractFile } from "../src/createContractFile";

import { HardhatRuntimeEnvironment } from "hardhat/types";

import { Contract, ContractFactory } from "ethers";

import { dim, yellow, green } from "../src/colors";

import { run } from "hardhat";

export default async function deployVesting(hardhat: HardhatRuntimeEnvironment): Promise<void> {
  if (process.env.DEPLOY === "v1.0.0.vesting") {
    dim(`Deploying: Vesting`);
    dim(`Version: 1.0.0`);
  } else {
    return;
  }

  const { ethers }: any = hardhat;

  const name: string = "Vesting";
  const asxTokenAddress: string | undefined = process.env.ASX_TOKEN?.trim();

  const Vesting: ContractFactory = await ethers.getContractFactory("Vesting");
  const vesting: Contract = await Vesting.deploy(asxTokenAddress);

  await vesting.deployTransaction.wait();

  await vesting.deployed();

  green(`${name} deployed at ${vesting.address}`);

  createContractFile(name, vesting.address, [asxTokenAddress]);

  try {
    await run("verify:verify", {
      address: vesting.address,
      constructorArguments: [asxTokenAddress],
    });
  } catch (error) {
    yellow(`\nErrors found during verification of ${name}:  ${error}...`);
  }
}
