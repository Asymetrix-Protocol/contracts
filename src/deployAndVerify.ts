import { createContractFile } from "./createContractFile";

import { ethers, upgrades, run, network } from "hardhat";

import { cyan, yellow, green, dim } from "./colors";

import { Contract, ContractFactory } from "ethers";

import fs from "fs";

export async function deployAndVerify(
  name: string,
  args: any[],
  skipIfAlreadyDeployed: boolean,
  options?: any
): Promise<Contract> {
  // Checks if the deployment file exists
  const directory: string = `${__dirname}/../deployments/${network.name}/${name}.json`;

  if (fs.existsSync(directory) && skipIfAlreadyDeployed) {
    const { address }: any = JSON.parse(fs.readFileSync(`${directory}`, "utf8"));

    dim(`Skipping deployment of ${name} with address ${address}`);

    return await ethers.getContractAt(name, address);
  }

  cyan(`\nDeploying ${name}...`);

  const contractFactory: ContractFactory = await ethers.getContractFactory(name);
  const instance: Contract = await upgrades.deployProxy(contractFactory, args, { ...options });

  await instance.deployTransaction.wait(3);
  await instance.deployed();

  green(`${name} deployed at ${instance.address}`);

  createContractFile(name, instance.address, args, options);

  // This section runs without waiting to process it faster
  try {
    await run("verify:verify", {
      address: instance.address,
      constructorArguments: [],
    });
  } catch (error) {
    yellow(`\nErrors found during verification of ${name}: ${error}...`);
  }

  return instance;
}
