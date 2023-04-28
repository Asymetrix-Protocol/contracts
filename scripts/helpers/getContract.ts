import { Contract } from "ethers";

export const getContract = async (hardhat: any, name: string): Promise<Contract> => {
  const { deployments }: any = hardhat;
  const signers: any = await hardhat.ethers.getSigners();

  return hardhat.ethers.getContractAt(name, (await deployments.get(name)).address, signers[0]);
};
