import { artifacts, network } from "hardhat";

import { Artifact } from "hardhat/types";

import fs from "fs";

export function createContractFile(name: string, address: string, args: any[], options?: any): void {
  const obtainedArtifact: Artifact = artifacts.readArtifactSync(name);

  fs.writeFile(
    `${__dirname}/../deployments/${network.name}/${name}.json`,
    JSON.stringify({ name, chainId: network.config.chainId, address, args, options, abi: obtainedArtifact.abi }),
    (err) => {
      if (err) {
        console.error(err);

        return;
      }
    }
  );
}
