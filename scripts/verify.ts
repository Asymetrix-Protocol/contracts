#!/usr/bin/env node

import { verifyAddress } from "./helpers/verifyAddress";

import hardhat from "hardhat";

import chalk from "chalk";

import find from "find";

import fs from "fs";

const info = (msg: any): void => console.log(chalk.dim(msg));
const success = (msg: any): void => console.log(chalk.green(msg));
const error = (msg: any): void => console.error(chalk.red(msg));

async function run() {
  const network: string = hardhat.network.name;

  info(`Verifying Smart Contracts on network: ${network}`);

  const filePath: string = "./deployments/" + network + "/";
  let toplevelContracts: Array<any> = [];

  // Read deployment JSON files
  fs.readdirSync(filePath).filter((fileName: any) => {
    if (fileName.includes(".json")) {
      const contractName: string = fileName.substring(0, fileName.length - 5).trim(); // strip .json
      const contractDirPath: string = find.fileSync(contractName + ".sol", "./contracts/")[0];

      if (!contractDirPath) {
        error(`There is no matching contract for ${contractName}. This is likely becuase the deployment contract name is different from the Solidity contract title.
           Run verification manually. See verifyEtherscanClone() for details`);

        return;
      }

      const deployment: any = JSON.parse(fs.readFileSync(filePath + fileName, "utf8"));

      toplevelContracts.push({
        address: deployment.address,
        contractPath: contractDirPath + ":" + contractName,
        contractName,
        constructorArgs: deployment.args,
      });
    }
  });

  info(`Attempting to verify ${toplevelContracts.length} smart contracts`);

  for (let index: number = 0; index < toplevelContracts.length; ++index) {
    const contract: any = toplevelContracts[index];
    let argsArray: Array<any> = [];
    let args: string = "";

    if (contract.constructorArgs.length > 0) {
      contract.constructorArgs.forEach((arg: any) => {
        args = args.concat('"', arg, '" '); // format constructor args in correct form - "arg" "arg"

        argsArray.push(arg);
      });
    }

    await verifyAddress(hardhat, contract.address, argsArray);
  }

  success("Done!");
}

run();
