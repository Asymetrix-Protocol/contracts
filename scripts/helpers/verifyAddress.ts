import { HardhatRuntimeEnvironment } from "hardhat/types";

export const verifyAddress = async (
  hardhat: HardhatRuntimeEnvironment,
  address: string,
  args: Array<any>
): Promise<void> => {
  const network: string = hardhat.network.name;

  try {
    await hardhat.run("verify:verify", {
      address: address,
      constructorArguments: args || [],
      config: "",
      network: network,
    });
  } catch (error) {
    console.log("Error: ", error);
  }
};
