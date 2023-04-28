import { Log, TransactionReceipt } from "@ethersproject/providers";

import { Contract, providers, Transaction } from "ethers";

import { LogDescription } from "@ethersproject/abi";

export async function getEvents(
  provider: providers.JsonRpcProvider,
  tx: Transaction,
  contract: Contract
): Promise<(LogDescription | undefined)[]> {
  const receipt: TransactionReceipt = await provider.getTransactionReceipt(tx.hash as string);

  return receipt.logs.map((log: Log) => {
    try {
      return contract.interface.parseLog(log);
    } catch (e: any) {}
  });
}
