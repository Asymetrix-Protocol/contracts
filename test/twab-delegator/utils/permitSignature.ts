import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumberish, ethers } from "ethers";

import { signPermit } from "./signPermit";

type EIP2612Permit = {
  permitToken: string;
  fromWallet: SignerWithAddress;
  spender: string;
  amount: BigNumberish;
  provider: ethers.providers.Provider;
};

const PERMIT_SIG_NAME: string = "Asymetrix Protocol ControlledToken";

export async function permitSignature({ permitToken, fromWallet, spender, amount, provider }: EIP2612Permit) {
  const permitDeadline = (await provider.getBlock("latest")).timestamp + 50;
  const network = await provider.getNetwork();
  const chainId = network.chainId;

  const domain = {
    name: PERMIT_SIG_NAME,
    version: "1",
    chainId,
    verifyingContract: permitToken,
  };

  const message = {
    owner: fromWallet.address,
    spender: spender,
    value: amount.toString(),
    nonce: 0,
    deadline: permitDeadline,
  };

  const permit = await signPermit(fromWallet, domain, message);

  return { deadline: permitDeadline, ...ethers.utils.splitSignature(permit.sig) };
}
