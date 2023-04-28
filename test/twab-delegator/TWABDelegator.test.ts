import { BigNumber, Contract, ContractFactory, ContractTransaction, PopulatedTransaction, Transaction } from "ethers";

import { getFirstLidoRebaseTimestamp } from "../../scripts/helpers/getFirstLidoRebaseTimestamp";

import { increaseTime as increaseTimeUtil } from "./utils/increaseTime";
import { getEvents as getEventsUtil } from "./utils/getEvents";
import { permitSignature } from "./utils/permitSignature";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Block, TransactionResponse } from "@ethersproject/providers";

import hardhat, { ethers, upgrades } from "hardhat";

import { LogDescription } from "@ethersproject/abi";

import { expect } from "chai";

const { constants, provider, utils } = ethers;
const { AddressZero, MaxUint256, Zero } = constants;
const { parseEther: toWei } = utils;

const getEvents = (tx: Transaction, contract: Contract) => getEventsUtil(provider, tx, contract);
const increaseTime = (time: number) => increaseTimeUtil(provider, time);

const MAX_EXPIRY: number = 15552000; // 180 days

const getTimestamp = async () => (await provider.getBlock("latest")).timestamp;

const getMaxExpiryTimestamp = async () => (await provider.getBlock("latest")).timestamp + MAX_EXPIRY;

describe("TWABDelegator", () => {
  let secondDelegatee: SignerWithAddress;
  let firstDelegatee: SignerWithAddress;
  let stranger: SignerWithAddress;
  let owner: SignerWithAddress;

  let PrizePoolHarness: ContractFactory;
  let Ticket: ContractFactory;
  let ASX: ContractFactory;

  let twabDelegator: Contract;
  let prizePool: Contract;
  let ticket: Contract;
  let asx: Contract;

  let initializeTx: ContractTransaction;

  let constructorTest: boolean = false;

  const getDelegationAddress = async (transaction: any) => {
    const ticketEvents: (LogDescription | undefined)[] = await getEvents(transaction, twabDelegator);
    const delegationCreatedEvent: LogDescription | undefined = ticketEvents.find(
      (event: LogDescription | undefined) => event && event.name === "DelegationCreated"
    );

    return delegationCreatedEvent?.args["delegation"];
  };

  const deployTwabDelegator = async (
    ticketAddress: string = ticket.address,
    minLockDuration: BigNumber,
    maxLockDuration: BigNumber
  ): Promise<Contract> => {
    const twabDelegatorContractFactory: ContractFactory = await ethers.getContractFactory("TWABDelegatorHarness");
    const contractDeployed: Contract = await upgrades.deployProxy(
      twabDelegatorContractFactory,
      [ticketAddress, minLockDuration, maxLockDuration],
      {
        initializer: "initialize(address,uint96,uint96)",
        unsafeAllow: ["delegatecall"],
      }
    );

    initializeTx = contractDeployed.deployTransaction;

    return contractDeployed;
  };

  beforeEach(async () => {
    await hardhat.network.provider.send("hardhat_reset");

    [owner, firstDelegatee, secondDelegatee, stranger] = await ethers.getSigners();

    ASX = await ethers.getContractFactory("ASX");
    asx = await upgrades.deployProxy(
      ASX,
      ["Asymetrix Governance Token", "ASX", ethers.utils.parseEther("100000000"), owner.address],
      { initializer: "initialize" }
    );

    PrizePoolHarness = await ethers.getContractFactory("PrizePoolHarness", owner);
    prizePool = await upgrades.deployProxy(PrizePoolHarness, [
      owner.address,
      owner.address,
      asx.address,
      BigNumber.from(ethers.utils.parseEther("10000000")),
      BigNumber.from("604800"),
      BigNumber.from("86400"),
      BigNumber.from("14400"), // 4 hours
      getFirstLidoRebaseTimestamp(),
      BigNumber.from("500"), // 5.00%
    ]);

    Ticket = await ethers.getContractFactory("TicketHarness");
    ticket = await upgrades.deployProxy(Ticket, ["Pool Share Token ", "PST", 6, prizePool.address]);

    await prizePool.setTicket(ticket.address);

    if (!constructorTest) {
      twabDelegator = await deployTwabDelegator(undefined, BigNumber.from("86400"), BigNumber.from(MAX_EXPIRY));
    }
  });

  describe("initialize()", () => {
    beforeEach(() => {
      constructorTest = true;
    });

    afterEach(() => {
      constructorTest = false;
    });

    it("should fail if `initialize()` method is called more than once", async () => {
      const minLockDuration: BigNumber = BigNumber.from("86400");
      const maxLockDuration: BigNumber = BigNumber.from(MAX_EXPIRY);
      const twabDelegator: Contract = await deployTwabDelegator(undefined, minLockDuration, maxLockDuration);

      await expect(
        twabDelegator.connect(owner).initialize(ticket.address, minLockDuration, maxLockDuration)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if contract is not initializing - 1", async () => {
      const minLockDuration: BigNumber = BigNumber.from("86400");
      const maxLockDuration: BigNumber = BigNumber.from(MAX_EXPIRY);
      const twabDelegator: Contract = await deployTwabDelegator(undefined, minLockDuration, maxLockDuration);

      await expect(
        twabDelegator
          .connect(owner)
          ["testOnlyInitializingModifier(address,uint96,uint96)"](ticket.address, minLockDuration, maxLockDuration)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if contract is not initializing - 1", async () => {
      await expect(twabDelegator.connect(owner)["testOnlyInitializingModifier()"]()).to.be.revertedWith(
        "Initializable: contract is not initializing"
      );
    });

    it("should deploy and set initial values", async () => {
      const minLockDuration: BigNumber = BigNumber.from("86400");
      const maxLockDuration: BigNumber = BigNumber.from(MAX_EXPIRY);
      const twabDelegator: Contract = await deployTwabDelegator(undefined, minLockDuration, maxLockDuration);

      await expect(initializeTx).to.emit(twabDelegator, "TicketSet").withArgs(ticket.address);
      await expect(initializeTx).to.emit(twabDelegator, "MinLockDurationSet").withArgs(minLockDuration);
      await expect(initializeTx).to.emit(twabDelegator, "MaxLockDurationSet").withArgs(maxLockDuration);

      expect(await twabDelegator.connect(owner).minLockDuration()).to.be.equal(minLockDuration);
      expect(await twabDelegator.connect(owner).maxLockDuration()).to.be.equal(maxLockDuration);
      expect(await twabDelegator.connect(owner).ticket()).to.be.equal(ticket.address);
    });

    it("should fail to deploy if ticket address is address zero", async () => {
      await expect(
        deployTwabDelegator(AddressZero, BigNumber.from("86400"), BigNumber.from(MAX_EXPIRY))
      ).to.be.revertedWith("TWABDelegator/tick-not-zero-addr");
    });
  });

  describe("createDelegation()", () => {
    const amount: BigNumber = toWei("1000");

    beforeEach(async () => {
      await ticket.connect(owner).mint(owner.address, amount);
      await ticket.connect(owner).approve(twabDelegator.address, MaxUint256);
    });

    it("should allow anyone to create a delegation", async () => {
      const transaction: TransactionResponse = await twabDelegator.createDelegation(
        owner.address,
        0,
        firstDelegatee.address,
        MAX_EXPIRY
      );
      const delegationAddress: string = await getDelegationAddress(transaction);
      const expiryTimestamp: number = await getMaxExpiryTimestamp();

      await expect(transaction)
        .to.emit(twabDelegator, "DelegationCreated")
        .withArgs(owner.address, 0, expiryTimestamp, firstDelegatee.address, delegationAddress, owner.address);

      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(owner.address)).to.eq(amount);

      const accountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(accountDetails.balance).to.eq(Zero);

      const delegation: Contract = await ethers.getContractAt("Delegation", delegationAddress);

      expect(await delegation.connect(owner).lockUntil()).to.eq(expiryTimestamp);

      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(Zero);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(firstDelegatee.address);
    });

    it("should fail to create a delegation if slot passed is already used", async () => {
      await twabDelegator.connect(owner).createDelegation(owner.address, 0, firstDelegatee.address, MAX_EXPIRY);

      await expect(
        twabDelegator.connect(owner).createDelegation(owner.address, 0, secondDelegatee.address, MAX_EXPIRY)
      ).to.be.revertedWith("ERC1167: create2 failed");
    });

    it("should fail to create delegation if delegator is address zero", async () => {
      await expect(
        twabDelegator.connect(owner).createDelegation(AddressZero, 0, firstDelegatee.address, MAX_EXPIRY)
      ).to.be.revertedWith("TWABDelegator/not-dlgtr");
    });

    it("should fail to create a delegation if expiry is less than min lock duration", async () => {
      await expect(
        twabDelegator
          .connect(owner)
          .createDelegation(
            owner.address,
            0,
            firstDelegatee.address,
            (await twabDelegator.connect(owner).minLockDuration()).sub(1)
          )
      ).to.be.revertedWith("TWABDelegator/lock-too-short");
    });

    it("should fail to create a delegation if expiry is greater than max lock duration", async () => {
      await expect(
        twabDelegator
          .connect(owner)
          .createDelegation(
            owner.address,
            0,
            firstDelegatee.address,
            (await twabDelegator.connect(owner).maxLockDuration()).add(1)
          )
      ).to.be.revertedWith("TWABDelegator/lock-too-long");
    });

    it("delegation: should fail if `initialize()` method is called more than once", async () => {
      const transaction: TransactionResponse = await twabDelegator.createDelegation(
        owner.address,
        0,
        firstDelegatee.address,
        MAX_EXPIRY
      );
      const delegationAddress: string = await getDelegationAddress(transaction);
      const delegation: Contract = await ethers.getContractAt("Delegation", delegationAddress);

      await expect(delegation.connect(owner).initialize(BigNumber.from(0))).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("delegation: should fail if not an owner is trying to execute calls", async () => {
      const transaction: TransactionResponse = await twabDelegator.createDelegation(
        owner.address,
        0,
        firstDelegatee.address,
        MAX_EXPIRY
      );
      const delegationAddress: string = await getDelegationAddress(transaction);
      const delegation: Contract = await ethers.getContractAt("Delegation", delegationAddress);

      await expect(delegation.connect(owner).executeCalls([])).to.be.revertedWith("Delegation/only-owner");
    });

    it("delegation: should fail if not an owner is trying to set lock until", async () => {
      const transaction: TransactionResponse = await twabDelegator.createDelegation(
        owner.address,
        0,
        firstDelegatee.address,
        MAX_EXPIRY
      );
      const delegationAddress: string = await getDelegationAddress(transaction);
      const delegation: Contract = await ethers.getContractAt("Delegation", delegationAddress);

      await expect(delegation.connect(owner).setLockUntil(BigNumber.from(0))).to.be.revertedWith(
        "Delegation/only-owner"
      );
    });
  });

  describe("updateDelegatee()", () => {
    const amount: BigNumber = toWei("1000");
    let delegationAddress: string = "";

    beforeEach(async () => {
      await ticket.connect(owner).mint(owner.address, amount);
      await ticket.connect(owner).approve(twabDelegator.address, MaxUint256);

      const transaction: any = await twabDelegator.createDelegation(
        owner.address,
        0,
        firstDelegatee.address,
        MAX_EXPIRY
      );

      delegationAddress = await getDelegationAddress(transaction);

      await twabDelegator.connect(owner).fundDelegation(owner.address, 0, amount);
    });

    it("should allow a delegator to transfer a delegation to another delegatee", async () => {
      await increaseTime(MAX_EXPIRY + 1);

      expect(await twabDelegator.connect(owner).updateDelegatee(owner.address, 0, secondDelegatee.address, 0))
        .to.emit(twabDelegator, "DelegateeUpdated")
        .withArgs(owner.address, 0, secondDelegatee.address, await getTimestamp(), owner.address);

      const firstDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(firstDelegateeAccountDetails.balance).to.eq(Zero);

      const secondDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(secondDelegatee.address);

      expect(secondDelegateeAccountDetails.balance).to.eq(amount);

      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(amount);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(secondDelegatee.address);
    });

    it("should allow a delegator to transfer a delegation to another delegatee", async () => {
      await increaseTime(MAX_EXPIRY + 1);

      expect(await twabDelegator.connect(owner).updateDelegatee(owner.address, 0, secondDelegatee.address, 0))
        .to.emit(twabDelegator, "DelegateeUpdated")
        .withArgs(owner.address, 0, secondDelegatee.address, await getTimestamp(), owner.address);

      const firstDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(firstDelegateeAccountDetails.balance).to.eq(Zero);

      const secondDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(secondDelegatee.address);
      expect(secondDelegateeAccountDetails.balance).to.eq(amount);

      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(amount);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(secondDelegatee.address);
    });

    it("should allow a delegator to withdraw from a delegation that was transferred to another delegatee", async () => {
      await increaseTime(MAX_EXPIRY + 1);

      await twabDelegator.connect(owner).updateDelegatee(owner.address, 0, secondDelegatee.address, 0);

      expect(await twabDelegator.connect(owner).withdrawDelegation(owner.address, 0, amount))
        .to.emit(twabDelegator, "WithdrewDelegation")
        .withArgs(owner.address, 0, amount, owner.address);

      const firstDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(firstDelegateeAccountDetails.balance).to.eq(Zero);

      const secondDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(secondDelegatee.address);

      expect(secondDelegateeAccountDetails.balance).to.eq(Zero);

      expect(await ticket.connect(owner).balanceOf(owner.address)).to.eq(amount);
      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(Zero);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(secondDelegatee.address);
    });

    it("should fail to update a delegatee if caller is not the delegator of the delegation", async () => {
      await expect(
        twabDelegator.connect(stranger).updateDelegatee(owner.address, 0, secondDelegatee.address, 0)
      ).to.be.revertedWith("TWABDelegator/not-dlgtr");
    });

    it("should allow a delegator to update the lock duration", async () => {
      await increaseTime(MAX_EXPIRY + 1);

      expect(await twabDelegator.connect(owner).updateDelegatee(owner.address, 0, secondDelegatee.address, MAX_EXPIRY))
        .to.emit(twabDelegator, "DelegateeUpdated")
        .withArgs(owner.address, 0, secondDelegatee.address, await getMaxExpiryTimestamp(), owner.address);

      const delegation: any = await twabDelegator.connect(owner).getDelegation(owner.address, 0);

      expect(delegation.lockUntil).to.equal((await getTimestamp()) + MAX_EXPIRY);
    });

    it("should fail to update a delegatee if delegatee address passed is address zero", async () => {
      await expect(twabDelegator.connect(owner).updateDelegatee(owner.address, 0, AddressZero, 0)).to.be.revertedWith(
        "TWABDelegator/dlgt-not-zero-addr"
      );
    });

    it("should fail to update an inexistent delegation", async () => {
      await expect(
        twabDelegator.connect(owner).updateDelegatee(owner.address, 1, secondDelegatee.address, 0)
      ).to.be.revertedWithoutReason();
    });

    it("should fail to update a delegatee if delegation is still locked", async () => {
      await expect(
        twabDelegator.connect(owner).updateDelegatee(owner.address, 0, secondDelegatee.address, 0)
      ).to.be.revertedWith("TWABDelegator/delegation-locked");
    });
  });

  describe("fundDelegation()", () => {
    const amount: BigNumber = toWei("1000");
    let delegationAddress: string = "";

    beforeEach(async () => {
      await ticket.connect(owner).mint(owner.address, amount);
      await ticket.connect(owner).approve(twabDelegator.address, MaxUint256);

      await ticket.connect(owner).mint(stranger.address, amount);
      await ticket.connect(stranger).approve(twabDelegator.address, MaxUint256);

      const transaction: any = await twabDelegator
        .connect(owner)
        .createDelegation(owner.address, 0, firstDelegatee.address, MAX_EXPIRY);

      delegationAddress = await getDelegationAddress(transaction);
    });

    it("should allow anyone to transfer tickets to a delegation", async () => {
      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(Zero);

      expect(await twabDelegator.connect(stranger).fundDelegation(owner.address, 0, amount))
        .to.emit(twabDelegator, "DelegationFunded")
        .withArgs(owner.address, 0, amount, stranger.address);

      const firstDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(firstDelegateeAccountDetails.balance).to.eq(amount);

      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(amount);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(firstDelegatee.address);
    });

    it("should fund an inexistent delegation and then create it", async () => {
      await twabDelegator.connect(stranger).fundDelegation(owner.address, 1, amount);

      const transaction: any = await twabDelegator
        .connect(owner)
        .createDelegation(owner.address, 1, firstDelegatee.address, MAX_EXPIRY);

      delegationAddress = await getDelegationAddress(transaction);

      const firstDelegateeAccountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(firstDelegateeAccountDetails.balance).to.eq(amount);

      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(amount);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(firstDelegatee.address);
    });

    it("should fail to transfer tickets to a delegation if delegator passed is address zero", async () => {
      await expect(twabDelegator.connect(stranger).fundDelegation(AddressZero, 0, amount)).to.be.revertedWith(
        "TWABDelegator/dlgtr-not-zero-adr"
      );
    });

    it("should fail to transfer tickets to a delegation if amount passed is not greater than zero", async () => {
      await expect(twabDelegator.connect(stranger).fundDelegation(owner.address, 0, Zero)).to.be.revertedWith(
        "TWABDelegator/amount-gt-zero"
      );
    });
  });

  describe("transferDelegationTo()", () => {
    const amount: BigNumber = toWei("1000");
    let delegationAddress: string = "";

    beforeEach(async () => {
      await ticket.connect(owner).mint(owner.address, amount);
      await ticket.connect(owner).approve(twabDelegator.address, MaxUint256);

      const transaction: any = await twabDelegator
        .connect(owner)
        .createDelegation(owner.address, 0, firstDelegatee.address, MAX_EXPIRY);

      delegationAddress = await getDelegationAddress(transaction);

      await twabDelegator.connect(owner).fundDelegation(owner.address, 0, amount);
    });

    it("should allow a delegator to transfer tickets from a delegation", async () => {
      await increaseTime(MAX_EXPIRY + 1);

      expect(await twabDelegator.connect(owner).transferDelegationTo(0, amount, owner.address))
        .to.emit(twabDelegator, "TransferredDelegation")
        .withArgs(owner.address, 0, amount, owner.address);

      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(owner.address)).to.eq(amount);

      const accountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(accountDetails.balance).to.eq(Zero);

      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(Zero);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(firstDelegatee.address);
    });

    it("should allow a delegator to transfer tickets from a delegation to another user", async () => {
      await increaseTime(MAX_EXPIRY + 1);

      expect(await twabDelegator.connect(owner).transferDelegationTo(0, amount, stranger.address))
        .to.emit(twabDelegator, "TransferredDelegation")
        .withArgs(owner.address, 0, amount, stranger.address);

      expect(await ticket.connect(owner).balanceOf(twabDelegator.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(owner.address)).to.eq(Zero);
      expect(await ticket.connect(owner).balanceOf(stranger.address)).to.eq(amount);

      const accountDetails: any = await ticket.connect(owner).getAccountDetails(firstDelegatee.address);

      expect(accountDetails.balance).to.eq(Zero);

      expect(await ticket.connect(owner).balanceOf(delegationAddress)).to.eq(Zero);
      expect(await ticket.connect(owner).delegateOf(delegationAddress)).to.eq(firstDelegatee.address);
    });

    it("should fail to transfer tickets from a delegation if caller is not the delegator", async () => {
      await expect(
        twabDelegator.connect(stranger).transferDelegationTo(0, amount, owner.address)
      ).to.be.revertedWithoutReason();
    });

    it("should fail to transfer tickets from a delegation if amount is not greater than zero", async () => {
      await expect(twabDelegator.connect(owner).transferDelegationTo(0, Zero, owner.address)).to.be.revertedWith(
        "TWABDelegator/amount-gt-zero"
      );
    });

    it("should fail to transfer tickets from a delegation if recipient is address zero", async () => {
      await expect(twabDelegator.connect(owner).transferDelegationTo(0, amount, AddressZero)).to.be.revertedWith(
        "TWABDelegator/to-not-zero-addr"
      );
    });

    it("should fail to transfer tickets from an inexistent delegation", async () => {
      await expect(
        twabDelegator.connect(owner).transferDelegationTo(1, amount, owner.address)
      ).to.be.revertedWithoutReason();
    });

    it("should fail to transfer tickets from a delegation if still locked", async () => {
      await expect(twabDelegator.connect(owner).transferDelegationTo(0, amount, owner.address)).to.be.revertedWith(
        "TWABDelegator/delegation-locked"
      );
    });

    it("delegation: should fail to execute call", async () => {
      await increaseTime(MAX_EXPIRY + 1);

      try {
        await twabDelegator.connect(owner).transferDelegationTo(0, amount.add(1), owner.address);
      } catch (e: any) {}
    });
  });

  describe("multicall()", () => {
    it("should allow a user to run multiple transactions in one go", async () => {
      const amount: BigNumber = toWei("1000");

      await ticket.connect(owner).mint(owner.address, amount);
      await ticket.connect(owner).approve(twabDelegator.address, amount);

      const createDelegationTx: PopulatedTransaction = await twabDelegator.populateTransaction.createDelegation(
        owner.address,
        0,
        firstDelegatee.address,
        0
      );

      await twabDelegator.connect(owner).multicall([createDelegationTx.data]);
    });
  });

  describe("permitAndMulticall()", () => {
    it("should allow a user to stake in one transaction", async () => {
      const amount: BigNumber = toWei("1000");

      await ticket.connect(owner).mint(owner.address, amount);

      const signature: any = await permitSignature({
        permitToken: ticket.address,
        fromWallet: owner,
        spender: twabDelegator.address,
        amount,
        provider,
      });
      const createDelegationTx: PopulatedTransaction = await twabDelegator.populateTransaction.createDelegation(
        owner.address,
        0,
        firstDelegatee.address,
        0
      );

      await twabDelegator
        .connect(owner)
        .permitAndMulticall(amount, { v: signature.v, r: signature.r, s: signature.s, deadline: signature.deadline }, [
          createDelegationTx.data,
        ]);
    });
  });

  describe("getDelegation()", () => {
    it("should return an empty one", async () => {
      const position: string = await twabDelegator.connect(owner).computeDelegationAddress(owner.address, 0);
      const { delegation, delegatee, balance, lockUntil, wasCreated } = await twabDelegator
        .connect(owner)
        .getDelegation(owner.address, 0);

      expect(delegation).to.equal(position);
      expect(delegatee).to.equal(AddressZero);
      expect(balance).to.equal("0");
      expect(lockUntil).to.equal("0");
      expect(wasCreated).to.equal(false);
    });

    it("should allow a user to get the delegation info", async () => {
      const amount: BigNumber = toWei("1000");

      await ticket.connect(owner).mint(owner.address, amount);
      await ticket.connect(owner).approve(twabDelegator.address, MaxUint256);

      const transaction: any = await twabDelegator
        .connect(owner)
        .createDelegation(owner.address, 0, firstDelegatee.address, MAX_EXPIRY);

      await twabDelegator.connect(owner).fundDelegation(owner.address, 0, amount);

      const block: Block = await ethers.provider.getBlock(transaction.blockNumber);
      const position: string = await twabDelegator.connect(owner).computeDelegationAddress(owner.address, 0);
      const { delegation, delegatee, balance, lockUntil, wasCreated } = await twabDelegator
        .connect(owner)
        .getDelegation(owner.address, 0);

      expect(delegation).to.equal(position);
      expect(delegatee).to.equal(firstDelegatee.address);
      expect(balance).to.equal(amount);
      expect(lockUntil).to.equal(block.timestamp + MAX_EXPIRY);
      expect(wasCreated).to.equal(true);
    });
  });

  describe("setMinLockDuration()", () => {
    it("should fail if not an owner is trying to set a min lock duration", async () => {
      await expect(twabDelegator.connect(stranger).setMinLockDuration(BigNumber.from("0"))).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should fail if a new min lock duration GT max lock duration", async () => {
      await expect(twabDelegator.connect(owner).setMinLockDuration(BigNumber.from(MAX_EXPIRY + 1))).to.be.revertedWith(
        "TWABDelegator/min-lock-duration-is-too-big"
      );
    });

    it("should set a new min lock duration by an owner", async () => {
      const minLockDuration: BigNumber = BigNumber.from("100");

      await expect(twabDelegator.connect(owner).setMinLockDuration(minLockDuration))
        .to.emit(twabDelegator, "MinLockDurationSet")
        .withArgs(minLockDuration);

      expect(await twabDelegator.connect(owner).minLockDuration()).to.be.equal(minLockDuration);
    });
  });

  describe("setMaxLockDuration()", () => {
    it("should fail if not an owner is trying to set a max lock duration", async () => {
      await expect(twabDelegator.connect(stranger).setMaxLockDuration(BigNumber.from("0"))).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should fail if a new max lock duration LT min lock duration", async () => {
      await expect(twabDelegator.connect(owner).setMaxLockDuration(BigNumber.from("86399"))).to.be.revertedWith(
        "TWABDelegator/max-lock-duration-is-too-small"
      );
    });

    it("should set a new max lock duration by an owner", async () => {
      const maxLockDuration: BigNumber = BigNumber.from(MAX_EXPIRY);

      await expect(twabDelegator.connect(owner).setMaxLockDuration(maxLockDuration))
        .to.emit(twabDelegator, "MaxLockDurationSet")
        .withArgs(maxLockDuration);

      expect(await twabDelegator.connect(owner).maxLockDuration()).to.be.equal(maxLockDuration);
    });
  });
});
