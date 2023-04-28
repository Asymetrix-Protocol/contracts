import { DeployResult } from "hardhat-deploy/types";

import { displayResult } from "./displayResult";

import { deployments } from "hardhat";

import { cyan } from "./colors";

export async function deployAndLog(name: string, options: any): Promise<DeployResult> {
  cyan(`\nDeploying ${name} ...`);

  // Needed to create new contracts, otherwise it reuses existing contracts
  if (!options.skipIfAlreadyDeployed) {
    await deployments.delete(name);
  }

  const result: DeployResult = await deployments.deploy(name, options);

  displayResult(name, result);

  return result;
}
