import { Contract, ContractFactory, ContractTransaction } from "ethers";

import { createContractFile } from "../src/createContractFile";

import { HardhatRuntimeEnvironment } from "hardhat/types";

import { dim, yellow, green } from "../src/colors";

import { run } from "hardhat";

export default async function deployTimelockController(hardhat: HardhatRuntimeEnvironment): Promise<void> {
  if (process.env.DEPLOY === "v1.0.0.timelock") {
    dim(`Deploying: TimelockController`);
    dim(`Version: 1.0.0`);
  } else {
    return;
  }

  const [deployer] = await hardhat.ethers.getSigners();

  const name: string = "TimelockController";

  const minDelay: number = Number(process.env.MIN_DELAY?.trim() || "172800");
  const proposers: string[] = process.env.PROPOSERS ? process.env.PROPOSERS.trim().split(",") : [deployer.address];
  const executors: string[] = process.env.EXECUTORS ? process.env.EXECUTORS.trim().split(",") : [deployer.address];
  const proxyAdminAddress: string | undefined = process.env.PROXY_ADMIN?.trim();

  if (proxyAdminAddress === undefined || proxyAdminAddress === "") {
    yellow("ProxyAdmin contract address is not provided");

    return;
  }

  const TimelockController: ContractFactory = await hardhat.ethers.getContractFactory(name);
  const timelockController: Contract = await TimelockController.deploy(minDelay, proposers, executors);

  await timelockController.deployTransaction.wait(3);

  await timelockController.deployed();

  green(`${name} deployed at ${timelockController.address}`);

  createContractFile(name, timelockController.address, [minDelay, proposers, executors]);

  const ProxyAdmin: ContractFactory = await hardhat.ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin: Contract = ProxyAdmin.attach(proxyAdminAddress);

  const tx: ContractTransaction = await proxyAdmin.transferOwnership(timelockController.address);

  tx.wait(1);

  try {
    await run("verify:verify", {
      address: timelockController.address,
      constructorArguments: [minDelay, proposers, executors],
    });
  } catch (error) {
    yellow(`\nErrors found during verification of ${name}:  ${error}...`);
  }
}
