import { providers } from "ethers";

export async function increaseTime(provider: providers.JsonRpcProvider, time: number): Promise<void> {
  await provider.send("evm_increaseTime", [time]);
  await provider.send("evm_mine", []);
}
