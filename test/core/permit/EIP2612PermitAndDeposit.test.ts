import { getFirstLidoRebaseTimestamp } from "../../../scripts/helpers/getFirstLidoRebaseTimestamp";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { utils, Contract, ContractFactory, BigNumber } from "ethers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { delegateSignature } from "../helpers/delegateSignature";

import { Signer } from "@ethersproject/abstract-signer";

import { signPermit } from "../helpers/signPermit";

import { Network } from "@ethersproject/providers";

import hre, { ethers, upgrades } from "hardhat";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const { constants, getContractFactory, getSigners, provider } = ethers;
const { parseEther: toWei, splitSignature } = utils;
const { AddressZero } = constants;
const { getNetwork } = provider;
const { artifacts } = hre;

describe("EIP2612PermitAndDeposit", () => {
  let prizeFlushManager: SignerWithAddress;
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let PrizePoolHarness: ContractFactory;

  let prizePoolStub: MockContract;

  let permitAndDeposit: Contract;
  let prizePool: Contract;
  let ticket: Contract;
  let usdc: Contract;

  let chainId: number;

  type EIP2612PermitAndDepositToAndDelegate = {
    prizePool: string;
    fromWallet?: SignerWithAddress;
    toWallet?: SignerWithAddress;
    to: string;
    amount: string;
    delegateAddress: string;
  };

  async function generateDelegateSignature(fromWallet: SignerWithAddress, delegateAddress: string): Promise<any> {
    const {
      user,
      delegate,
      deadline: delegateDeadline,
      v,
      r,
      s,
    }: any = await delegateSignature({
      ticket,
      userWallet: fromWallet,
      delegate: delegateAddress,
    });

    return { user, delegate, signature: { deadline: delegateDeadline, v, r, s } };
  }

  async function depositToAndDelegate({
    prizePool,
    fromWallet,
    to,
    amount,
    delegateAddress,
  }: EIP2612PermitAndDepositToAndDelegate): Promise<any> {
    if (!fromWallet) {
      fromWallet = wallet1;
    }

    const { user, ...delegateSign }: any = await generateDelegateSignature(fromWallet, delegateAddress);

    return permitAndDeposit.depositToAndDelegate(prizePool, amount, to, delegateSign);
  }

  async function permitAndDepositToAndDelegate({
    prizePool,
    fromWallet,
    toWallet,
    to,
    amount,
    delegateAddress,
  }: EIP2612PermitAndDepositToAndDelegate): Promise<any> {
    if (!fromWallet) {
      fromWallet = wallet1;
    }

    const { user, ...delegateSign }: any = await generateDelegateSignature(
      toWallet ? toWallet : fromWallet,
      delegateAddress
    );

    const permitDeadline: number = (await provider.getBlock("latest")).timestamp + 50;

    const permit: any = await signPermit(
      fromWallet,
      {
        name: "USD Coin",
        version: "1",
        chainId,
        verifyingContract: usdc.address,
      },
      {
        owner: toWallet ? fromWallet.address : user,
        spender: permitAndDeposit.address,
        value: amount,
        nonce: 0,
        deadline: permitDeadline,
      }
    );

    const permitSignature: any = { deadline: permitDeadline, ...splitSignature(permit.sig) };

    return permitAndDeposit.permitAndDepositToAndDelegate(prizePool, amount, to, permitSignature, delegateSign);
  }

  beforeEach(async () => {
    await hre.network.provider.send("hardhat_reset");

    [wallet1, wallet2, prizeFlushManager] = await getSigners();

    const network: Network = await getNetwork();

    chainId = network.chainId;

    const Usdc: ContractFactory = await getContractFactory("EIP2612PermitMintable");

    usdc = await upgrades.deployProxy(Usdc, ["USD Coin", "USDC"]);

    const PrizePoolStub: Artifact = await artifacts.readArtifact("PrizePoolStub");

    prizePoolStub = await deployMockContract(wallet1 as Signer, PrizePoolStub.abi);

    await prizePoolStub.mock.depositToken.returns(usdc.address);

    const ASX: ContractFactory = await getContractFactory("ASX");
    const asx: Contract = await upgrades.deployProxy(
      ASX,
      ["Asymetrix Governance Token", "ASX", ethers.utils.parseEther("100000000"), wallet1.address],
      { initializer: "initialize" }
    );

    PrizePoolHarness = await getContractFactory("PrizePoolHarness", wallet1);
    prizePool = await upgrades.deployProxy(PrizePoolHarness, [
      wallet1.address,
      prizePoolStub.address,
      asx.address,
      BigNumber.from(ethers.utils.parseEther("10000000")),
      BigNumber.from("604800"),
      BigNumber.from("86400"),
      BigNumber.from("14400"), // 4 hours
      getFirstLidoRebaseTimestamp(),
      BigNumber.from("500"), // 5.00%
    ]);

    const EIP2612PermitAndDeposit: ContractFactory = await getContractFactory("EIP2612PermitAndDeposit");

    permitAndDeposit = await upgrades.deployProxy(EIP2612PermitAndDeposit, []);

    const Ticket: ContractFactory = await getContractFactory("TicketHarness");

    ticket = await upgrades.deployProxy(Ticket, ["Pool Share Token", "PST", 18, prizePool.address]);

    await prizePool.connect(wallet1).setTicket(ticket.address);
    await prizePool.connect(wallet1).setPrizeFlush(prizeFlushManager.address);
  });

  describe("permitAndDepositToAndDelegate()", () => {
    it("should deposit and delegate to itself", async () => {
      const amount: BigNumber = toWei("100");

      await usdc.connect(wallet1).mint(wallet1.address, toWei("1000"));

      await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

      await permitAndDepositToAndDelegate({
        prizePool: prizePool.address,
        to: wallet1.address,
        amount: "100000000000000000000",
        delegateAddress: wallet1.address,
      });

      expect(await usdc.connect(wallet1).balanceOf(prizePool.address)).to.equal(amount);
      expect(await usdc.connect(wallet1).balanceOf(wallet1.address)).to.equal(toWei("900"));
      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(amount);
      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet1.address);
    });

    it("should deposit and delegate to someone else", async () => {
      const amount: BigNumber = toWei("100");

      await usdc.connect(wallet1).mint(wallet1.address, toWei("1000"));

      await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

      await permitAndDepositToAndDelegate({
        prizePool: prizePool.address,
        to: wallet1.address,
        amount: "100000000000000000000",
        delegateAddress: wallet2.address,
      });

      expect(await usdc.connect(wallet1).balanceOf(prizePool.address)).to.equal(amount);
      expect(await usdc.connect(wallet1).balanceOf(wallet1.address)).to.equal(toWei("900"));
      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(amount);
      expect(await ticket.connect(wallet1).balanceOf(wallet2.address)).to.equal(toWei("0"));
      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet2.address);
      expect(await ticket.connect(wallet1).delegateOf(wallet2.address)).to.equal(AddressZero);
    });

    it("should deposit tickets to someone else and delegate on their behalf", async () => {
      const amount: BigNumber = toWei("100");

      await usdc.connect(wallet1).mint(wallet1.address, toWei("1000"));

      await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

      await permitAndDepositToAndDelegate({
        prizePool: prizePool.address,
        toWallet: wallet2,
        to: wallet2.address,
        amount: "100000000000000000000",
        delegateAddress: wallet2.address,
      });

      expect(await usdc.connect(wallet1).balanceOf(prizePool.address)).to.equal(amount);
      expect(await usdc.connect(wallet1).balanceOf(wallet1.address)).to.equal(toWei("900"));
      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(toWei("0"));
      expect(await ticket.connect(wallet1).balanceOf(wallet2.address)).to.equal(amount);
      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(AddressZero);
      expect(await ticket.connect(wallet1).delegateOf(wallet2.address)).to.equal(wallet2.address);
    });

    it("should not allow anyone else to use the signature", async () => {
      const amount: BigNumber = toWei("100");

      await usdc.connect(wallet1).mint(wallet1.address, toWei("1000"));

      await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

      await expect(
        permitAndDepositToAndDelegate({
          prizePool: prizePool.address,
          to: wallet2.address,
          fromWallet: wallet2,
          amount: "100000000000000000000",
          delegateAddress: wallet2.address,
        })
      ).to.be.revertedWith("ERC20Permit: invalid signature");
    });
  });

  describe("permitAndDepositToAndDelegate()", () => {
    it("should deposit and delegate to itself", async () => {
      const amount: BigNumber = toWei("100");

      await usdc.connect(wallet1).mint(wallet1.address, toWei("1000"));
      await usdc.connect(wallet1).approve(permitAndDeposit.address, amount);

      expect(await usdc.connect(wallet1).allowance(wallet1.address, permitAndDeposit.address)).to.equal(amount);

      await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

      await depositToAndDelegate({
        prizePool: prizePool.address,
        to: wallet1.address,
        amount: "100000000000000000000",
        delegateAddress: wallet1.address,
      });

      expect(await usdc.connect(wallet1).balanceOf(prizePool.address)).to.equal(amount);
      expect(await usdc.connect(wallet1).balanceOf(wallet1.address)).to.equal(toWei("900"));
      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(amount);
      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet1.address);
    });

    it("should deposit and delegate to someone else", async () => {
      const amount: BigNumber = toWei("100");

      await usdc.connect(wallet1).mint(wallet1.address, toWei("1000"));
      await usdc.connect(wallet1).approve(permitAndDeposit.address, amount);

      expect(await usdc.connect(wallet1).allowance(wallet1.address, permitAndDeposit.address)).to.equal(amount);

      await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

      await depositToAndDelegate({
        prizePool: prizePool.address,
        to: wallet1.address,
        amount: "100000000000000000000",
        delegateAddress: wallet2.address,
      });

      expect(await usdc.connect(wallet1).balanceOf(prizePool.address)).to.equal(amount);
      expect(await usdc.connect(wallet1).balanceOf(wallet1.address)).to.equal(toWei("900"));
      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(amount);
      expect(await ticket.connect(wallet1).balanceOf(wallet2.address)).to.equal(toWei("0"));
      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet2.address);
      expect(await ticket.connect(wallet1).delegateOf(wallet2.address)).to.equal(AddressZero);
    });
  });
});
