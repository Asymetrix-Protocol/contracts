import { BigNumber, constants, Contract, ContractFactory, ContractTransaction, utils } from "ethers";

import { getFirstLidoRebaseTimestamp } from "../../../scripts/helpers/getFirstLidoRebaseTimestamp";

import { getPreviousBlockTimestamp, getBlockTimestamp } from "../helpers/getBlockTimestamp";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import hardhat, { ethers, artifacts, upgrades } from "hardhat";

import { Signer } from "@ethersproject/abstract-signer";

import { increaseTime } from "../helpers/increaseTime";

import { Artifact } from "hardhat/types";

import { call } from "../helpers/call";

import { expect } from "chai";

import moment from "moment";

type UserStakeInfo = {
  lastClaimed: BigNumber;
  reward: BigNumber;
  former: BigNumber;
};

const { getContractFactory, getSigners } = ethers;
const { AddressZero, MaxUint256 } = constants;
const { parseEther: toWei } = utils;

const debug = require("debug")("ptv3:PrizePool.test");

let NFT_TOKEN_ID: number = 1;

describe("PrizePool", function () {
  let prizeFlushManager: SignerWithAddress;
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;

  let ERC721MintableContract: ContractFactory;
  let ERC20MintableContract: ContractFactory;
  let PrizePoolHarness: ContractFactory;
  let DrawBeacon: ContractFactory;
  let DrawBuffer: ContractFactory;
  let Ticket: ContractFactory;
  let ASX: ContractFactory;

  let PrizePoolStub: Artifact;
  let ICompLike: Artifact;
  let IERC721: Artifact;

  // Set as `any` cause types are conflicting between the different path for ethers
  let prizePool2: any;
  let prizePool: any;

  let depositToken: Contract;
  let erc721Token: Contract;
  let erc20Token: Contract;
  let drawBeacon: Contract;
  let drawBuffer: Contract;
  let ticket: Contract;
  let asx: Contract;

  let erc721tokenMock: MockContract;
  let prizePoolStub: MockContract;
  let compLike: MockContract;

  let initializeTx: ContractTransaction;

  let snapshotId: BigNumber;

  let rewardPerSecond: BigNumber;
  let maxClaimInterval: BigNumber;
  let claimInterval: BigNumber;
  let freeExitDuration: BigNumber;
  let firstLidoRebaseTimestamp: BigNumber;
  let lidoAPR: BigNumber;

  const depositTokenIntoPrizePool = async (
    recipientAddress: string,
    amount: BigNumber,
    token: Contract = depositToken,
    operator: SignerWithAddress = wallet1
  ): Promise<any> => {
    await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

    await token.connect(operator).approve(prizePool.address, amount);
    await token.connect(operator).mint(operator.address, amount);

    if (token.address === depositToken.address) {
      return await prizePool.connect(operator).depositTo(recipientAddress, amount);
    } else {
      return await token.connect(operator).transfer(prizePool.address, amount);
    }
  };

  const depositNftIntoPrizePool = async (walletAddress: string): Promise<void> => {
    await erc721Token.mint(walletAddress, NFT_TOKEN_ID);
    await erc721Token.transferFrom(walletAddress, prizePool.address, NFT_TOKEN_ID);
  };

  const calculateExpectedRewardPerShare = async (
    prevTotalSupply: BigNumber,
    prevRewardPerShare: BigNumber,
    prevLastUpdated: BigNumber,
    wallet: SignerWithAddress = wallet1
  ): Promise<BigNumber> => {
    if ((await prizePool.connect(wallet).getTicket()) != AddressZero) {
      if (!prevTotalSupply.isZero()) {
        const timeDelta: BigNumber = (await getPreviousBlockTimestamp()).sub(prevLastUpdated);
        const reward: BigNumber = timeDelta.mul(await prizePool.connect(wallet).getRewardPerSecond());

        return prevRewardPerShare.add(reward.mul(utils.parseEther("1")).div(prevTotalSupply));
      }
    }

    return prevRewardPerShare;
  };

  const calculateExpectedUserStakeInfo = async (
    prevUserStakeInfo: UserStakeInfo,
    prevUserBalance: BigNumber,
    currUserBalance: BigNumber,
    wallet: SignerWithAddress = wallet1
  ): Promise<UserStakeInfo> => {
    const rewardPerShare: BigNumber = await prizePool.connect(wallet).getRewardPerShare();
    const reward: BigNumber = prevUserStakeInfo.reward.add(
      prevUserBalance.mul(rewardPerShare).sub(prevUserStakeInfo.former)
    );
    const former: BigNumber = currUserBalance.mul(rewardPerShare);

    return { reward, former, lastClaimed: await getPreviousBlockTimestamp() };
  };

  const calculateSecondsNumberToPayExitFee = async (
    withdrawTimestamp: BigNumber,
    wallet: SignerWithAddress = wallet1
  ): Promise<BigNumber> => {
    const firstLidoRebaseTimestamp: BigNumber = BigNumber.from(
      await prizePool.connect(wallet).getFirstLidoRebaseTimestamp()
    );

    if (withdrawTimestamp.lt(firstLidoRebaseTimestamp)) {
      return withdrawTimestamp.sub(await prizePool.connect(wallet).getDeploymentTimestamp());
    } else {
      const secondsPerDay: BigNumber = BigNumber.from(86_400);
      const daysDiff: BigNumber = withdrawTimestamp.sub(firstLidoRebaseTimestamp).div(BigNumber.from(secondsPerDay));
      const lastLidoRebaseTimestamp: BigNumber = firstLidoRebaseTimestamp.add(daysDiff.mul(secondsPerDay));

      return withdrawTimestamp.sub(lastLidoRebaseTimestamp);
    }
  };

  const calculateExitFee = async (
    amount: BigNumber,
    withdrawTimestamp: BigNumber,
    wallet: SignerWithAddress = wallet1
  ): Promise<[BigNumber, BigNumber]> => {
    const secondsNumber: BigNumber = await calculateSecondsNumberToPayExitFee(withdrawTimestamp, wallet);
    const percent: BigNumber = secondsNumber
      .mul(await prizePool.connect(wallet).getLidoAPR())
      .mul(toWei("1"))
      .div(BigNumber.from(31_536_000))
      .div(BigNumber.from(10000));
    const actualAmount: BigNumber = amount.mul(toWei("1").sub(percent)).div(toWei("1"));
    const exitFee: BigNumber = amount.sub(actualAmount);

    return [actualAmount, exitFee];
  };

  before(async () => {
    [wallet1, wallet2, prizeFlushManager, wallet3] = await getSigners();

    debug(`using wallet ${wallet1.address}`);

    ERC20MintableContract = await getContractFactory("contracts/core/test/ERC20Mintable.sol:ERC20Mintable", wallet1);
    ERC721MintableContract = await getContractFactory("ERC721Mintable", wallet1);
    PrizePoolHarness = await getContractFactory("PrizePoolHarness", wallet1);
    Ticket = await getContractFactory("Ticket");
    ASX = await getContractFactory("ASX");
    DrawBeacon = await getContractFactory("DrawBeacon");
    DrawBuffer = await getContractFactory("DrawBuffer");

    ICompLike = await artifacts.readArtifact("ICompLike");
    IERC721 = await artifacts.readArtifact("IERC721Upgradeable");
    PrizePoolStub = await artifacts.readArtifact("PrizePoolStub");

    compLike = await deployMockContract(wallet1 as Signer, ICompLike.abi);

    rewardPerSecond = BigNumber.from("31709791980000000");
    maxClaimInterval = BigNumber.from("604800"); // 1 week
    claimInterval = BigNumber.from("7200"); // 2 hours
    freeExitDuration = BigNumber.from("14400"); // 4 hours
    firstLidoRebaseTimestamp = getFirstLidoRebaseTimestamp();
    lidoAPR = BigNumber.from("500"); // 5.00%

    debug("mocking tokens...");

    depositToken = await upgrades.deployProxy(ERC20MintableContract, ["Token", "TOKE"]);

    erc20Token = await upgrades.deployProxy(ERC20MintableContract, ["Token", "TOKE"]);

    erc721Token = await upgrades.deployProxy(ERC721MintableContract, []);

    erc721tokenMock = await deployMockContract(wallet1 as Signer, IERC721.abi);

    asx = await upgrades.deployProxy(
      ASX,
      ["Asymetrix Governance Token", "ASX", ethers.utils.parseEther("100000000"), wallet1.address],
      { initializer: "initialize" }
    );

    prizePoolStub = await deployMockContract(wallet1 as Signer, PrizePoolStub.abi);

    await prizePoolStub.mock.depositToken.returns(depositToken.address);

    prizePool = await upgrades.deployProxy(PrizePoolHarness, [
      wallet1.address,
      prizePoolStub.address,
      asx.address,
      rewardPerSecond,
      maxClaimInterval,
      claimInterval,
      freeExitDuration,
      firstLidoRebaseTimestamp,
      lidoAPR,
    ]);

    ticket = await upgrades.deployProxy(Ticket, ["Ticket", "TICK", 18, prizePool.address]);

    drawBuffer = await upgrades.deployProxy(DrawBuffer, [wallet1.address, 3]);

    drawBeacon = await upgrades.deployProxy(DrawBeacon, [
      wallet1.address,
      drawBuffer.address,
      1,
      Math.round(new Date().getTime() / 1000),
      86_400,
    ]);

    await prizePool.connect(wallet1).setTicket(ticket.address);
    await prizePool.connect(wallet1).setDrawBeacon(drawBeacon.address);
    await prizePool.connect(wallet1).setPrizeFlush(prizeFlushManager.address);
    await drawBuffer.connect(wallet1).setManager(drawBeacon.address);
  });

  beforeEach(async () => {
    snapshotId = await hardhat.network.provider.send("evm_snapshot");
  });

  afterEach(async () => {
    await hardhat.network.provider.send("evm_revert", [snapshotId]);
  });

  /*============================================ */
  // Constructor Functions ---------------------
  /*============================================ */
  describe("initialize()", () => {
    let prizePool: Contract;
    let ticket: Contract;

    beforeEach(async () => {
      prizePool = await upgrades.deployProxy(PrizePoolHarness, [
        wallet1.address,
        prizePoolStub.address,
        asx.address,
        rewardPerSecond,
        maxClaimInterval,
        claimInterval,
        freeExitDuration,
        firstLidoRebaseTimestamp,
        lidoAPR,
      ]);
      initializeTx = prizePool.deployTransaction;
      ticket = await upgrades.deployProxy(Ticket, ["Ticket", "TICK", 18, prizePool.address]);
    });

    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        prizePool
          .connect(wallet1)
          .initialize(
            wallet1.address,
            prizePoolStub.address,
            asx.address,
            rewardPerSecond,
            maxClaimInterval,
            claimInterval,
            freeExitDuration,
            firstLidoRebaseTimestamp,
            lidoAPR
          )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        prizePool
          .connect(wallet1)
          .testOnlyInitializingModifier(
            wallet1.address,
            asx.address,
            rewardPerSecond,
            maxClaimInterval,
            claimInterval,
            freeExitDuration,
            firstLidoRebaseTimestamp,
            lidoAPR
          )
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fire the events", async () => {
      await expect(initializeTx).to.emit(prizePool, "LiquidityCapSet").withArgs(MaxUint256);
      await expect(initializeTx).to.emit(prizePool, "RewardTokenSet").withArgs(asx.address);
      await expect(initializeTx).to.emit(prizePool, "RewardPerSecondSet").withArgs(rewardPerSecond);
      await expect(initializeTx)
        .to.emit(prizePool, "RewardUpdated")
        .withArgs(await getBlockTimestamp((await ethers.provider.getBlockNumber()) - 1));
      await expect(initializeTx).to.emit(prizePool, "MaxClaimIntervalSet").withArgs(maxClaimInterval);
      await expect(initializeTx).to.emit(prizePool, "ClaimIntervalSet").withArgs(claimInterval);
      await expect(initializeTx).to.emit(prizePool, "FreeExitDurationSet").withArgs(freeExitDuration);
      await expect(initializeTx).to.emit(prizePool, "FirstLidoRebaseTimestampSet").withArgs(firstLidoRebaseTimestamp);
      await expect(initializeTx).to.emit(prizePool, "LidoAPRSet").withArgs(lidoAPR);

      await expect(prizePool.connect(wallet1).setPrizeFlush(prizeFlushManager.address))
        .to.emit(prizePool, "PrizeFlushSet")
        .withArgs(prizeFlushManager.address);

      const setTicketTx: ContractTransaction = await prizePool.connect(wallet1).setTicket(ticket.address);

      await expect(setTicketTx).to.emit(prizePool, "TicketSet").withArgs(ticket.address);
      await expect(setTicketTx).to.emit(prizePool, "BalanceCapSet").withArgs(MaxUint256);
    });

    it("should set all the vars", async () => {
      expect(await prizePool.connect(wallet1).getDrawBeacon()).to.equal(AddressZero);
      expect(await prizePool.connect(wallet1).getToken()).to.equal(depositToken.address);
      expect(await prizePool.connect(wallet1).getPrizeFlush()).to.equal(AddressZero);
      expect(await prizePool.connect(wallet1).getRewardToken()).to.equal(asx.address);
      expect(await prizePool.connect(wallet1).getRewardPerSecond()).to.equal(rewardPerSecond);
      expect(await prizePool.connect(wallet1).getMaxClaimInterval()).to.equal(maxClaimInterval);
      expect(await prizePool.connect(wallet1).getClaimInterval()).to.equal(claimInterval);
      expect(await prizePool.connect(wallet1).getFreeExitDuration()).to.equal(freeExitDuration);
      expect(await prizePool.connect(wallet1).getDeploymentTimestamp()).to.equal(
        (await getPreviousBlockTimestamp()).sub(BigNumber.from(1))
      );
      expect(await prizePool.connect(wallet1).getFirstLidoRebaseTimestamp()).to.equal(firstLidoRebaseTimestamp);
      expect(await prizePool.connect(wallet1).getLidoAPR()).to.equal(lidoAPR);
    });

    it("should reject invalid params", async () => {
      const PrizePoolHarness: ContractFactory = await getContractFactory("PrizePoolHarness", wallet1);

      await expect(
        upgrades.deployProxy(PrizePoolHarness, [
          wallet1.address,
          prizePoolStub.address,
          AddressZero,
          rewardPerSecond,
          maxClaimInterval,
          claimInterval,
          freeExitDuration,
          firstLidoRebaseTimestamp,
          lidoAPR,
        ])
      ).to.be.revertedWith("PrizePool/reward-token-not-zero-address");

      await expect(
        upgrades.deployProxy(PrizePoolHarness, [
          wallet1.address,
          prizePoolStub.address,
          asx.address,
          rewardPerSecond,
          maxClaimInterval,
          claimInterval,
          freeExitDuration,
          BigNumber.from(moment().startOf("day").unix()),
          BigNumber.from(500),
        ])
      ).to.be.revertedWith("PrizePool/first-lido-rebase-timestamp-must-be-in-the-future");

      await expect(
        upgrades.deployProxy(PrizePoolHarness, [
          wallet1.address,
          prizePoolStub.address,
          asx.address,
          rewardPerSecond,
          maxClaimInterval,
          claimInterval,
          freeExitDuration,
          firstLidoRebaseTimestamp,
          BigNumber.from(10001),
        ])
      ).to.be.revertedWith("PrizePool/lido-APR-is-too-high");

      prizePool2 = await upgrades.deployProxy(PrizePoolHarness, [
        wallet1.address,
        prizePoolStub.address,
        asx.address,
        rewardPerSecond,
        maxClaimInterval,
        claimInterval,
        freeExitDuration,
        firstLidoRebaseTimestamp,
        lidoAPR,
      ]);

      await expect(prizePool2.connect(wallet1).setTicket(AddressZero)).to.be.revertedWith(
        "PrizePool/ticket-not-zero-address"
      );
    });
  });

  /*============================================ */
  // Core Functions ----------------------------
  /*============================================ */
  describe("Core Functions", () => {
    describe("award()", () => {
      it("should return early if amount is 0", async () => {
        await prizePool.connect(wallet1).setPrizeFlush(wallet1.address);

        await expect(prizePool.connect(wallet1).award(wallet2.address, toWei("0"))).to.not.emit(prizePool, "Awarded");
      });

      it("should fail if amount is GREATER THEN the current award balance", async () => {
        await prizePool.connect(wallet1).setPrizeFlush(wallet1.address);
        await prizePool.connect(wallet1).setCurrentAwardBalance(toWei("1000"));

        await expect(prizePool.connect(wallet1).award(wallet2.address, toWei("2000"))).to.be.revertedWith(
          "PrizePool/award-exceeds-avail"
        );
      });

      it("should succeed to award tickets and emit Awarded", async () => {
        await prizePool.connect(wallet1).setPrizeFlush(wallet1.address);
        await prizePool.connect(wallet1).setCurrentAwardBalance(toWei("2000"));

        await expect(prizePool.connect(wallet1).award(wallet2.address, toWei("1000")))
          .to.emit(prizePool, "Awarded")
          .withArgs(wallet2.address, ticket.address, toWei("1000"));
      });

      it("should fail if not a prize flush is trying to award", async () => {
        await expect(prizePool.connect(wallet1).award(wallet1.address, toWei("2000"))).to.be.revertedWith(
          "PrizePool/only-prizeFlush"
        );
      });
    });

    describe("depositToAndDelegate()", () => {
      it("should delegate after depositing", async () => {
        const amount: BigNumber = toWei("100");

        await depositToken.connect(wallet1).approve(prizePool.address, amount);
        await depositToken.connect(wallet1).mint(wallet1.address, amount);

        await prizePoolStub.mock.supplyTokenTo.withArgs(amount, prizePool.address).returns();

        await prizePool.connect(wallet1).depositToAndDelegate(wallet1.address, amount, wallet2.address);

        expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet2.address);
      });

      it("should fail if liquidity cap exceeded", async () => {
        await prizePool.connect(wallet1).setLiquidityCap(BigNumber.from(0));

        await expect(
          prizePool.connect(wallet1).depositToAndDelegate(wallet1.address, BigNumber.from(100), wallet2.address)
        ).to.be.revertedWith("PrizePool/exceeds-liquidity-cap");
      });
    });

    describe("depositTo()", () => {
      it("should revert when deposit exceeds liquidity cap", async () => {
        const amount: BigNumber = toWei("1");
        const liquidityCap: BigNumber = toWei("1000");

        await depositTokenIntoPrizePool(wallet1.address, liquidityCap);

        await prizePool.connect(wallet1).setLiquidityCap(liquidityCap);

        await expect(prizePool.connect(wallet1).depositTo(wallet2.address, amount)).to.be.revertedWith(
          "PrizePool/exceeds-liquidity-cap"
        );
      });

      it("should revert when user deposit exceeds ticket balance cap", async () => {
        const amount: BigNumber = toWei("1");
        const balanceCap: BigNumber = toWei("50000");

        await prizePool.connect(wallet1).setBalanceCap(balanceCap);

        await depositTokenIntoPrizePool(wallet1.address, balanceCap);

        await expect(depositTokenIntoPrizePool(wallet1.address, amount)).to.be.revertedWith(
          "PrizePool/exceeds-balance-cap"
        );
      });

      it("should revert when user deposit for another wallet exceeds ticket balance cap", async () => {
        const amount: BigNumber = toWei("1");
        const balanceCap: BigNumber = toWei("50000");

        await prizePool.connect(wallet1).setBalanceCap(balanceCap);

        await depositTokenIntoPrizePool(wallet2.address, balanceCap);

        await expect(depositTokenIntoPrizePool(wallet2.address, amount)).to.be.revertedWith(
          "PrizePool/exceeds-balance-cap"
        );
      });
    });

    describe("captureAwardBalance()", () => {
      it("should return 0", async () => {
        await prizePoolStub.mock.balanceOfToken.withArgs(prizePool.address).returns(0);

        await prizePool.connect(wallet1).captureAwardBalance();

        expect(await prizePool.connect(wallet1).awardBalance()).to.equal(0);
      });

      it("should handle when the balance is less than the collateral", async () => {
        await depositTokenIntoPrizePool(wallet1.address, toWei("100"));

        await prizePoolStub.mock.balanceOfToken.withArgs(prizePool.address).returns(toWei("99.9999"));

        expect(await prizePool.connect(wallet1).awardBalance()).to.equal(toWei("0"));
      });

      it("should handle the situation when the total accrued interest is less than the captured total", async () => {
        await depositTokenIntoPrizePool(wallet1.address, toWei("100"));

        await prizePoolStub.mock.balanceOfToken.withArgs(prizePool.address).returns(toWei("110"));

        // First capture the 10 tokens
        await prizePool.connect(wallet1).captureAwardBalance();

        await prizePoolStub.mock.balanceOfToken.withArgs(prizePool.address).returns(toWei("109.999"));

        // Now try to capture again
        await expect(prizePool.connect(wallet1).captureAwardBalance()).to.not.emit(prizePool, "AwardCaptured");
      });

      it("should track the yield less the total token supply", async () => {
        await depositTokenIntoPrizePool(wallet1.address, toWei("100"));

        await prizePoolStub.mock.balanceOfToken.withArgs(prizePool.address).returns(toWei("110"));

        await expect(prizePool.connect(wallet1).captureAwardBalance())
          .to.emit(prizePool, "AwardCaptured")
          .withArgs(toWei("10"));

        expect(await prizePool.connect(wallet1).awardBalance()).to.equal(toWei("10"));
      });
    });

    describe("withdrawFrom()", () => {
      it("should allow a user to withdraw instantly", async () => {
        const amount: BigNumber = toWei("10");

        await depositTokenIntoPrizePool(wallet1.address, amount);

        await prizePoolStub.mock.redeemToken.withArgs(amount).returns(amount);

        const withdrawFromTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .withdrawFrom(wallet1.address, amount);

        const [actualAmount, exitFee] = await calculateExitFee(amount, await getPreviousBlockTimestamp());

        await expect(withdrawFromTx)
          .to.emit(prizePool, "Withdrawal")
          .withArgs(wallet1.address, wallet1.address, ticket.address, amount, actualAmount, exitFee);
      });

      it("should charge exit fee from the first draw (without free exit window support)", async () => {
        const amount: BigNumber = BigNumber.from("100");

        await depositTokenIntoPrizePool(wallet1.address, amount);

        await prizePoolStub.mock.redeemToken.withArgs(amount).returns(amount);

        const prevPrizePoolBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(prizePool.address);
        const prevUserBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(wallet1.address);

        const withdrawFromTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .withdrawFrom(wallet1.address, amount);

        const currPrizePoolBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(prizePool.address);
        const currUserBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(wallet1.address);

        const [actualAmount, exitFee] = await calculateExitFee(amount, await getPreviousBlockTimestamp());

        await expect(withdrawFromTx)
          .to.emit(prizePool, "Withdrawal")
          .withArgs(wallet1.address, wallet1.address, ticket.address, amount, actualAmount, exitFee);

        expect(exitFee).to.be.not.equal(BigNumber.from(0));
        expect(currPrizePoolBalance).to.be.equal(prevPrizePoolBalance.sub(amount).add(exitFee));
        expect(currUserBalance).to.be.equal(prevUserBalance.add(amount).sub(exitFee));
      });

      it("should not charge exit fee if user is withdrawing in time of free exit window", async () => {
        await increaseTime(
          ethers.provider,
          (await drawBeacon.connect(wallet1).beaconPeriodRemainingSeconds()).toNumber()
        );

        await drawBeacon.connect(wallet1).startDraw();

        const amount: BigNumber = BigNumber.from(toWei("5"));

        await depositTokenIntoPrizePool(wallet1.address, amount);

        await prizePoolStub.mock.redeemToken.withArgs(amount).returns(amount);

        const prevPrizePoolBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(prizePool.address);
        const prevUserBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(wallet1.address);

        const withdrawFromTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .withdrawFrom(wallet1.address, amount);

        const currPrizePoolBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(prizePool.address);
        const currUserBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(wallet1.address);

        await expect(withdrawFromTx)
          .to.emit(prizePool, "Withdrawal")
          .withArgs(wallet1.address, wallet1.address, ticket.address, amount, amount, BigNumber.from("0"));

        expect(
          (await getPreviousBlockTimestamp()).sub(await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt())
        ).to.be.lte(await prizePool.connect(wallet1).getFreeExitDuration());
        expect(currPrizePoolBalance).to.be.equal(prevPrizePoolBalance.sub(amount));
        expect(currUserBalance).to.be.equal(prevUserBalance.add(amount));
      });

      it("should charge exit fee if user is withdrawing after of free exit window", async () => {
        await increaseTime(
          ethers.provider,
          (await drawBeacon.connect(wallet1).beaconPeriodRemainingSeconds()).toNumber()
        );

        await drawBeacon.connect(wallet1).startDraw();

        const amount: BigNumber = BigNumber.from(toWei("20"));

        await increaseTime(ethers.provider, await prizePool.connect(wallet1).getFreeExitDuration());

        await depositTokenIntoPrizePool(wallet1.address, amount);

        await prizePoolStub.mock.redeemToken.withArgs(amount).returns(amount);

        const prevPrizePoolBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(prizePool.address);
        const prevUserBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(wallet1.address);

        const withdrawFromTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .withdrawFrom(wallet1.address, amount);

        const [actualAmount, exitFee] = await calculateExitFee(amount, await getPreviousBlockTimestamp());

        const currPrizePoolBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(prizePool.address);
        const currUserBalance: BigNumber = await depositToken.connect(wallet1).balanceOf(wallet1.address);

        await expect(withdrawFromTx)
          .to.emit(prizePool, "Withdrawal")
          .withArgs(wallet1.address, wallet1.address, ticket.address, amount, actualAmount, exitFee);

        expect(exitFee).to.be.not.equal(BigNumber.from(0));
        expect(currPrizePoolBalance).to.be.equal(prevPrizePoolBalance.sub(amount).add(exitFee));
        expect(currUserBalance).to.be.equal(prevUserBalance.add(amount).sub(exitFee));
      });
    });
  });

  /*============================================ */
  // Getter Functions --------------------------
  /*============================================ */
  describe("Getter Functions", () => {
    it("should getAccountedBalance()", async () => {
      expect(await prizePool.connect(wallet1).getAccountedBalance()).to.equal(BigNumber.from(0));
    });

    it("should getBalanceCap()", async () => {
      expect(await prizePool.connect(wallet1).getBalanceCap()).to.equal(constants.MaxUint256);
    });

    it("should getLiquidityCap()", async () => {
      expect(await prizePool.connect(wallet1).getLiquidityCap()).to.equal(constants.MaxUint256);
    });

    it("should getTicket()", async () => {
      expect(await prizePool.connect(wallet1).getTicket()).to.equal(ticket.address);
    });

    it("should getDrawBeacon()", async () => {
      expect(await prizePool.connect(wallet1).getDrawBeacon()).to.equal(drawBeacon.address);
    });

    it("should getRewardToken()", async () => {
      expect(await prizePool.connect(wallet1).getRewardToken()).to.equal(asx.address);
    });

    it("should getPrizeFlush()", async () => {
      expect(await prizePool.connect(wallet1).getPrizeFlush()).to.equal(prizeFlushManager.address);
    });

    it("should getLastUpdated()", async () => {
      expect(await prizePool.connect(wallet1).getLastUpdated()).to.not.equal(BigNumber.from(0));
    });

    it("should getRewardPerSecond()", async () => {
      expect(await prizePool.connect(wallet1).getRewardPerSecond()).to.equal(rewardPerSecond);
    });

    it("should getRewardPerShare()", async () => {
      expect(await prizePool.connect(wallet1).getRewardPerShare()).to.equal(BigNumber.from(0));
    });

    it("should getMaxClaimInterval()", async () => {
      expect(await prizePool.connect(wallet1).getMaxClaimInterval()).to.equal(maxClaimInterval);
    });

    it("should getClaimInterval()", async () => {
      expect(await prizePool.connect(wallet1).getClaimInterval()).to.equal(claimInterval);
    });

    it("should getFreeExitDuration()", async () => {
      expect(await prizePool.connect(wallet1).getFreeExitDuration()).to.equal(freeExitDuration);
    });

    it("should getDeploymentTimestamp()", async () => {
      expect(await prizePool.connect(wallet1).getDeploymentTimestamp()).to.not.equal(BigNumber.from(0));
    });

    it("should getFirstLidoRebaseTimestamp()", async () => {
      expect(await prizePool.connect(wallet1).getFirstLidoRebaseTimestamp()).to.equal(firstLidoRebaseTimestamp);
    });

    it("should getLidoAPR()", async () => {
      expect(await prizePool.connect(wallet1).getLidoAPR()).to.equal(lidoAPR);
    });

    it("should getUserStakeInfo()", async () => {
      const userStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(wallet1.address);

      expect(userStakeInfo.reward).to.equal(BigNumber.from(0));
      expect(userStakeInfo.former).to.equal(BigNumber.from(0));
      expect(userStakeInfo.lastClaimed).to.equal(BigNumber.from(0));
    });

    it("should getDistributionEnd()", async () => {
      expect(await prizePool.connect(wallet1).getDistributionEnd()).to.equal(
        (await getBlockTimestamp(prizePool.deployTransaction.blockNumber)).add(BigNumber.from("31536000"))
      );
    });

    it("should getClaimableReward()", async () => {
      expect(await prizePool.connect(wallet1).getClaimableReward(wallet1.address)).to.equal(BigNumber.from(0));
    });

    it("should canAwardExternal()", async () => {
      await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(false);

      expect(await prizePool.connect(wallet1).canAwardExternal(erc20Token.address)).to.equal(false);

      await prizePoolStub.mock.canAwardExternal.withArgs(ticket.address).returns(true);

      expect(await prizePool.connect(wallet1).canAwardExternal(ticket.address)).to.equal(true);
    });

    describe("balance()", () => {
      it("should return zero if no deposits have been made", async () => {
        const balance: BigNumber = toWei("11");

        await prizePoolStub.mock.balanceOfToken.withArgs(prizePool.address).returns(balance);

        expect((await call(prizePool, "balance")).toString()).to.equal(balance);
      });
    });

    describe("compLikeDelegate()", () => {
      it("should fail to delegate tokens", async () => {
        await compLike.mock.balanceOf.withArgs(prizePool.address).returns(0);

        expect(await prizePool.connect(wallet1).compLikeDelegate(compLike.address, wallet3.address));
      });

      it("should succeed to delegate tokens", async () => {
        await compLike.mock.balanceOf.withArgs(prizePool.address).returns(100);
        await compLike.mock.delegate.withArgs(wallet3.address).returns();

        expect(await prizePool.connect(wallet1).compLikeDelegate(compLike.address, wallet3.address));
      });

      it("should fail if not an owner is trying to delegate tokens", async () => {
        await expect(prizePool.connect(wallet2).compLikeDelegate(compLike.address, wallet1.address)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });
    });

    describe("isControlled()", () => {
      it("should validate TRUE with ticket variable", async () => {
        expect(await prizePool.connect(wallet1).isControlled(await prizePool.connect(wallet1).getTicket())).to.equal(
          true
        );
      });

      it("should validate FALSE with non-ticket variable", async () => {
        expect(await prizePool.connect(wallet1).isControlled(AddressZero)).to.equal(false);
      });
    });
  });

  /*============================================ */
  // Setter Functions --------------------------
  /*============================================ */
  describe("Setter Functions", () => {
    let prizePool: Contract;
    let ticket: Contract;

    beforeEach(async () => {
      prizePool = await upgrades.deployProxy(PrizePoolHarness, [
        wallet1.address,
        prizePoolStub.address,
        asx.address,
        rewardPerSecond,
        maxClaimInterval,
        claimInterval,
        freeExitDuration,
        firstLidoRebaseTimestamp,
        lidoAPR,
      ]);

      ticket = await upgrades.deployProxy(Ticket, ["Ticket", "TICK", 18, prizePool.address]);
    });

    describe("setTicket()", () => {
      it("should allow the owner to set the ticket", async () => {
        await expect(prizePool.connect(wallet1).setTicket(wallet3.address))
          .to.emit(prizePool, "TicketSet")
          .withArgs(wallet3.address);

        expect(await prizePool.connect(wallet1).getTicket()).to.equal(wallet3.address);
      });

      it("should not allow anyone else to set the ticket", async () => {
        await expect(prizePool.connect(wallet2).setTicket(wallet3.address)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });

      it("should fail if ticket is already set", async () => {
        await prizePool.connect(wallet1).setTicket(wallet1.address);

        await expect(prizePool.connect(wallet1).setTicket(wallet1.address)).to.be.revertedWith(
          "PrizePool/ticket-already-set"
        );
      });
    });

    describe("setDrawBeacon", () => {
      it("should allow the owner to set the draw beacon", async () => {
        const drawBeacon: Contract = await upgrades.deployProxy(DrawBeacon, [
          wallet1.address,
          drawBuffer.address,
          1,
          Math.round(new Date().getTime() / 1000),
          1000,
        ]);
        const setDrawBeaconTx: ContractTransaction = await prizePool.connect(wallet1).setDrawBeacon(drawBeacon.address);

        await expect(setDrawBeaconTx).to.emit(prizePool, "DrawBeaconSet").withArgs(drawBeacon.address);

        expect(await prizePool.connect(wallet1).getDrawBeacon()).to.equal(drawBeacon.address);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setDrawBeacon(AddressZero)).to.be.revertedWith("Ownable/caller-not-owner");
      });

      it("should fail if a new draw beacon address is equal to zero address", async () => {
        await expect(prizePool.connect(wallet1).setDrawBeacon(AddressZero)).to.be.revertedWith(
          "PrizePool/draw-beacon-not-zero-address"
        );
      });
    });

    describe("setPrizeFlush()", () => {
      it("should allow the owner to set the prize flush", async () => {
        const prizeFlush: string = wallet1.address;

        await expect(prizePool.connect(wallet1).setPrizeFlush(prizeFlush))
          .to.emit(prizePool, "PrizeFlushSet")
          .withArgs(prizeFlush);

        expect(await prizePool.connect(wallet1).getPrizeFlush()).to.equal(prizeFlush);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setPrizeFlush(wallet2.address)).to.be.revertedWith("Ownable/caller-not-owner");
      });

      it("should fail if a new prize flush address is equal to zero address", async () => {
        await expect(prizePool.connect(wallet1).setPrizeFlush(AddressZero)).to.be.revertedWith(
          "PrizePool/prize-flush-not-zero-address"
        );
      });
    });

    describe("setBalanceCap", () => {
      it("should allow the owner to set the balance cap", async () => {
        const balanceCap: BigNumber = toWei("50000");

        await expect(prizePool.connect(wallet1).setBalanceCap(balanceCap))
          .to.emit(prizePool, "BalanceCapSet")
          .withArgs(balanceCap);

        expect(await prizePool.connect(wallet1).getBalanceCap()).to.equal(balanceCap);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setBalanceCap(toWei("50000"))).to.be.revertedWith("Ownable/caller-not-owner");
      });
    });

    describe("setLiquidityCap", () => {
      it("should allow the owner to set the liquidity cap", async () => {
        await prizePool.connect(wallet1).setTicket(ticket.address);

        const liquidityCap: BigNumber = toWei("1000");

        await expect(prizePool.connect(wallet1).setLiquidityCap(liquidityCap))
          .to.emit(prizePool, "LiquidityCapSet")
          .withArgs(liquidityCap);

        expect(await prizePool.connect(wallet1).getLiquidityCap()).to.equal(liquidityCap);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setLiquidityCap(toWei("1000"))).to.be.revertedWith("Ownable/caller-not-owner");
      });

      it("should fail if a new liquidity cap is too small", async () => {
        await prizePool.connect(wallet1).setTicket(ticket.address);

        const amount: BigNumber = BigNumber.from(100);

        await prizePool.connect(wallet1).mint(wallet1.address, amount, ticket.address);

        await expect(
          prizePool
            .connect(wallet1)
            .setLiquidityCap((await ticket.connect(wallet1).totalSupply()).sub(BigNumber.from(1)))
        ).to.be.revertedWith("PrizePool/liquidity-cap-too-small");
      });
    });

    describe("setRewardPerSecond", () => {
      it("should allow the owner to set the reward per second", async () => {
        const rewardPerSecond: BigNumber = BigNumber.from(100);
        const setRewardPerSecondTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .setRewardPerSecond(rewardPerSecond);

        await expect(setRewardPerSecondTx)
          .to.emit(prizePool, "RewardUpdated")
          .withArgs(await getPreviousBlockTimestamp());
        await expect(setRewardPerSecondTx).to.emit(prizePool, "RewardPerSecondSet").withArgs(rewardPerSecond);

        expect(await prizePool.connect(wallet1).getRewardPerSecond()).to.equal(rewardPerSecond);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setRewardPerSecond(BigNumber.from(100))).to.be.revertedWith("Ownable/caller-not-owner");
      });
    });

    describe("setMaxClaimInterval", () => {
      it("should allow the owner to set the maximum claim interval", async () => {
        const maxClaimInterval: BigNumber = BigNumber.from(1209600); // 2 weeks, in seconds
        const setMaxClaimIntervalTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .setMaxClaimInterval(maxClaimInterval);

        await expect(setMaxClaimIntervalTx).to.emit(prizePool, "MaxClaimIntervalSet").withArgs(maxClaimInterval);

        expect(await prizePool.connect(wallet1).getMaxClaimInterval()).to.equal(maxClaimInterval);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setMaxClaimInterval(BigNumber.from(0))).to.be.revertedWith("Ownable/caller-not-owner");
      });
    });

    describe("setClaimInterval", () => {
      it("should allow the owner to set the claim interval", async () => {
        const claimInterval: BigNumber = BigNumber.from(86400);
        const setClaimIntervalTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .setClaimInterval(claimInterval);

        await expect(setClaimIntervalTx).to.emit(prizePool, "ClaimIntervalSet").withArgs(claimInterval);

        expect(await prizePool.connect(wallet1).getClaimInterval()).to.equal(claimInterval);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setClaimInterval(BigNumber.from(86400))).to.be.revertedWith("Ownable/caller-not-owner");
      });

      it("should fail if a new claim interval is too big", async () => {
        await expect(prizePool.connect(wallet1).setClaimInterval(maxClaimInterval.add(1))).to.be.revertedWith(
          "PrizePool/claim-interval-is-too-big"
        );
      });
    });

    describe("setFreeExitDuration", () => {
      it("should allow the owner to set the free exit duration", async () => {
        const freeExitDuration: BigNumber = BigNumber.from(14400); // 4 hours
        const setFreeExitDurationTx: ContractTransaction = await prizePool
          .connect(wallet1)
          .setFreeExitDuration(freeExitDuration);

        await expect(setFreeExitDurationTx).to.emit(prizePool, "FreeExitDurationSet").withArgs(freeExitDuration);

        expect(await prizePool.connect(wallet1).getFreeExitDuration()).to.equal(freeExitDuration);
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.setFreeExitDuration(BigNumber.from(14400))).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });
    });

    describe("setLidoAPR", () => {
      it("should allow the owner to set the Lido APR", async () => {
        const lidoAPR: BigNumber = BigNumber.from(1000); // 10.00%
        const setLidoAPRTx: ContractTransaction = await prizePool.connect(wallet1).setLidoAPR(lidoAPR);

        await expect(setLidoAPRTx).to.emit(prizePool, "LidoAPRSet").withArgs(lidoAPR);

        expect(await prizePool.connect(wallet1).getLidoAPR()).to.equal(lidoAPR);
      });

      it("should allow the owner to set the Lido APR (bounds check)", async () => {
        let lidoAPR = BigNumber.from(0); // 0%

        await prizePool.connect(wallet1).setLidoAPR(lidoAPR);

        expect(await prizePool.connect(wallet1).getLidoAPR()).to.equal(lidoAPR);

        lidoAPR = BigNumber.from(10000); // 100.00%

        await prizePool.connect(wallet1).setLidoAPR(lidoAPR);

        expect(await prizePool.connect(wallet1).getLidoAPR()).to.equal(lidoAPR);
      });

      it("should fail if a new Lido APR is greater that 100.00%", async () => {
        // 100.01%
        await expect(prizePool.connect(wallet1).setLidoAPR(BigNumber.from(10001))).to.be.revertedWith(
          "PrizePool/lido-APR-is-too-high"
        );
      });

      it("should not allow anyone else to call", async () => {
        prizePool2 = prizePool.connect(wallet2 as Signer);

        // 10.00%
        await expect(prizePool2.setLidoAPR(BigNumber.from(1000))).to.be.revertedWith("Ownable/caller-not-owner");
      });
    });
  });

  /*============================================ */
  // Token Functions ---------------------------
  /*============================================ */
  describe("Token Functions", () => {
    describe("awardExternalERC20()", () => {
      beforeEach(async () => {
        await prizePool.connect(wallet1).setPrizeFlush(prizeFlushManager.address);
      });

      it("should exit early when amount = 0", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(true);

        await expect(
          prizePool.connect(prizeFlushManager).awardExternalERC20(wallet1.address, erc20Token.address, 0)
        ).to.not.emit(prizePool, "AwardedExternalERC20");
      });

      it("should only allow the prizeFlush to award external ERC20s", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(true);

        const prizePool2: Contract = prizePool.connect(wallet2 as Signer);

        await expect(prizePool2.awardExternalERC20(wallet1.address, wallet2.address, toWei("10"))).to.be.revertedWith(
          "PrizePool/only-prizeFlush"
        );
      });

      it("should allow arbitrary tokens to be transferred", async () => {
        const amount: BigNumber = toWei("10");

        await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(true);

        await depositTokenIntoPrizePool(wallet1.address, amount, erc20Token);

        await expect(
          prizePool.connect(prizeFlushManager).awardExternalERC20(wallet1.address, erc20Token.address, amount)
        )
          .to.emit(prizePool, "AwardedExternalERC20")
          .withArgs(wallet1.address, erc20Token.address, amount);
      });
    });

    describe("transferExternalERC20()", () => {
      beforeEach(async () => {
        await prizePool.connect(wallet1).setPrizeFlush(prizeFlushManager.address);
      });

      it("should exit early when amount = 0", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(true);

        await expect(
          prizePool.connect(prizeFlushManager).transferExternalERC20(wallet1.address, erc20Token.address, 0)
        ).to.not.emit(prizePool, "TransferredExternalERC20");
      });

      it("should only allow the prizeFlush to award external ERC20s", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(true);

        const prizePool2: Contract = prizePool.connect(wallet2 as Signer);

        await expect(
          prizePool2.transferExternalERC20(wallet1.address, wallet2.address, toWei("10"))
        ).to.be.revertedWith("PrizePool/only-prizeFlush");
      });

      it("should allow arbitrary tokens to be transferred", async () => {
        const amount: BigNumber = toWei("10");

        await depositTokenIntoPrizePool(wallet1.address, amount, erc20Token);

        await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(true);

        await expect(
          prizePool.connect(prizeFlushManager).transferExternalERC20(wallet1.address, erc20Token.address, amount)
        )
          .to.emit(prizePool, "TransferredExternalERC20")
          .withArgs(wallet1.address, erc20Token.address, amount);
      });

      it("should fail if an external token is invalid", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc20Token.address).returns(false);

        await expect(
          prizePool.connect(prizeFlushManager).transferExternalERC20(wallet1.address, erc20Token.address, toWei("10"))
        ).to.be.revertedWith("PrizePool/invalid-external-token");
      });
    });

    describe("awardExternalERC721()", () => {
      beforeEach(async () => {
        await prizePool.connect(wallet1).setPrizeFlush(prizeFlushManager.address);
      });

      it("should exit early when tokenIds list is empty", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721Token.address).returns(true);

        await expect(
          prizePool.connect(prizeFlushManager).awardExternalERC721(wallet1.address, erc721Token.address, [])
        ).to.not.emit(prizePool, "AwardedExternalERC721");
      });

      it("should only allow the prizeFlush to award external ERC721s", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721Token.address).returns(true);

        const prizePool2: Contract = prizePool.connect(wallet2 as Signer);

        await expect(
          prizePool2.awardExternalERC721(wallet1.address, erc721Token.address, [NFT_TOKEN_ID])
        ).to.be.revertedWith("PrizePool/only-prizeFlush");
      });

      it("should allow arbitrary tokens to be transferred", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721Token.address).returns(true);

        await depositNftIntoPrizePool(wallet1.address);

        await expect(
          prizePool.connect(prizeFlushManager).awardExternalERC721(wallet1.address, erc721Token.address, [NFT_TOKEN_ID])
        )
          .to.emit(prizePool, "AwardedExternalERC721")
          .withArgs(wallet1.address, erc721Token.address, [NFT_TOKEN_ID]);
      });

      it("should not DoS with faulty ERC721s", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721tokenMock.address).returns(true);

        await erc721tokenMock.mock["safeTransferFrom(address,address,uint256)"]
          .withArgs(prizePool.address, wallet1.address, NFT_TOKEN_ID)
          .reverts();

        await expect(
          prizePool
            .connect(prizeFlushManager)
            .awardExternalERC721(wallet1.address, erc721tokenMock.address, [NFT_TOKEN_ID])
        ).to.emit(prizePool, "ErrorAwardingExternalERC721");
      });

      it("should not emit faulty tokenIds", async () => {
        // Add faulty tokenId
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721tokenMock.address).returns(true);

        await erc721tokenMock.mock["safeTransferFrom(address,address,uint256)"]
          .withArgs(prizePool.address, wallet1.address, 1)
          .reverts();

        // Add non-faulty tokenId
        await erc721tokenMock.mock["safeTransferFrom(address,address,uint256)"]
          .withArgs(prizePool.address, wallet1.address, 2)
          .returns();

        await expect(
          prizePool.connect(prizeFlushManager).awardExternalERC721(wallet1.address, erc721tokenMock.address, [1, 2])
        )
          .to.emit(prizePool, "AwardedExternalERC721")
          .withArgs(wallet1.address, erc721tokenMock.address, [0, 2]);
      });

      it("should fail if an external token is invalid", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721tokenMock.address).returns(false);

        await expect(
          prizePool.connect(prizeFlushManager).awardExternalERC721(wallet1.address, erc721tokenMock.address, [1])
        ).to.be.revertedWith("PrizePool/invalid-external-token");
      });

      it("should fail if token IDs length is wrong", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721tokenMock.address).returns(true);

        await expect(
          prizePool
            .connect(prizeFlushManager)
            .awardExternalERC721(wallet1.address, erc721tokenMock.address, Array(1000 + 1).fill(1))
        ).to.be.revertedWith("PrizePool/wrong-array-length");
      });

      // Skipped because it runs for a long time. Unskip and run it manually.
      xit("should work with maximum token IDs number", async () => {
        await prizePoolStub.mock.canAwardExternal.withArgs(erc721tokenMock.address).returns(true);

        for (let i: number = 0; i < 1000; ++i) {
          await erc721tokenMock.mock["safeTransferFrom(address,address,uint256)"]
            .withArgs(prizePool.address, wallet1.address, i)
            .returns();
        }

        await expect(
          prizePool
            .connect(prizeFlushManager)
            .awardExternalERC721(wallet1.address, erc721tokenMock.address, Array.from(Array(1000).keys()))
        )
          .to.emit(prizePool, "AwardedExternalERC721")
          .withArgs(wallet1.address, erc721tokenMock.address, Array.from(Array(1000).keys()));
      });
    });

    describe("onERC721Received()", () => {
      it("should return the interface selector", async () => {
        expect(
          await prizePool.connect(wallet1).onERC721Received(prizePool.address, constants.AddressZero, 0, "0x150b7a02")
        ).to.equal("0x150b7a02");
      });

      it("should receive an ERC721 token when using safeTransferFrom", async () => {
        expect(await erc721Token.connect(wallet1).balanceOf(prizePool.address)).to.equal("0");

        await depositNftIntoPrizePool(wallet1.address);

        expect(await erc721Token.connect(wallet1).balanceOf(prizePool.address)).to.equal("1");
      });
    });
  });

  /*============================================ */
  // Internal Functions ------------------------
  /*============================================ */
  describe("Internal Functions", () => {
    it("should get the current block.timestamp", async () => {
      const timenow: number = (await ethers.provider.getBlock("latest")).timestamp;

      expect(await prizePool.connect(wallet1).internalCurrentTime()).to.equal(timenow);
    });
  });

  /*============================================ */
  // ASX Distribution Functions ----------------
  /*============================================ */
  describe("ASX Distribution Functions", () => {
    it("should deposit, update global reward, user reward and user former", async () => {
      const to: string = wallet1.address;
      const amount: BigNumber = BigNumber.from("100");

      for (let i: number = 0; i < 5; ++i) {
        const prevTotalSupply: BigNumber = await ticket.connect(wallet1).totalSupply();
        const prevRewardPerShare: BigNumber = await prizePool.connect(wallet1).getRewardPerShare();
        const prevLastUpdated: BigNumber = await prizePool.connect(wallet1).getLastUpdated();

        const prevUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(to);
        const prevUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(to);

        await depositTokenIntoPrizePool(to, amount);

        const currUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(to);
        const currUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(to);

        const expectedRewardPerShare: BigNumber = await calculateExpectedRewardPerShare(
          prevTotalSupply,
          prevRewardPerShare,
          prevLastUpdated
        );
        const expectedUserStakeInfo: UserStakeInfo = await calculateExpectedUserStakeInfo(
          prevUserStakeInfo,
          prevUserBalance,
          currUserBalance
        );

        expect(await prizePool.connect(wallet1).getRewardPerShare()).to.be.equal(expectedRewardPerShare);
        expect(await prizePool.connect(wallet1).getLastUpdated()).to.be.equal(await getPreviousBlockTimestamp());

        expect(currUserStakeInfo.reward).to.be.equal(expectedUserStakeInfo.reward);
        expect(currUserStakeInfo.former).to.be.equal(expectedUserStakeInfo.former);
        expect(currUserStakeInfo.lastClaimed).to.be.equal(BigNumber.from(0));
      }
    });

    it("should withdraw, update global reward, user reward and user former", async () => {
      const user: string = wallet1.address;
      const amount: BigNumber = BigNumber.from("100");

      for (let i: number = 0; i < 5; ++i) {
        await depositTokenIntoPrizePool(user, amount);
      }

      for (let i: number = 0; i < 5; ++i) {
        const prevTotalSupply: BigNumber = await ticket.connect(wallet1).totalSupply();
        const prevRewardPerShare: BigNumber = await prizePool.connect(wallet1).getRewardPerShare();
        const prevLastUpdated: BigNumber = await prizePool.connect(wallet1).getLastUpdated();

        const prevUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(user);
        const prevUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(user);

        await prizePoolStub.mock.redeemToken.withArgs(amount).returns(amount);
        await prizePool.connect(wallet1).withdrawFrom(user, amount);

        const currUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(user);
        const currUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(user);

        const expectedRewardPerShare: BigNumber = await calculateExpectedRewardPerShare(
          prevTotalSupply,
          prevRewardPerShare,
          prevLastUpdated
        );
        const expectedUserStakeInfo: UserStakeInfo = await calculateExpectedUserStakeInfo(
          prevUserStakeInfo,
          prevUserBalance,
          currUserBalance
        );

        expect(await prizePool.connect(wallet1).getRewardPerShare()).to.be.equal(expectedRewardPerShare);
        expect(await prizePool.connect(wallet1).getLastUpdated()).to.be.equal(await getPreviousBlockTimestamp());

        expect(currUserStakeInfo.reward).to.be.equal(expectedUserStakeInfo.reward);
        expect(currUserStakeInfo.former).to.be.equal(expectedUserStakeInfo.former);
        expect(currUserStakeInfo.lastClaimed).to.be.equal(BigNumber.from(0));
      }
    });

    it("should fail if not the ticket is trying to call updateUserRewardAndFormer()", async () => {
      await expect(
        prizePool.connect(wallet1).updateUserRewardAndFormer(AddressZero, BigNumber.from(0), BigNumber.from(0))
      ).to.be.revertedWith("PrizePool/only-ticket");
    });

    it("should transfer, update global reward, user rewards and user formers (for both users)", async () => {
      const from: string = wallet1.address;
      const to: string = wallet2.address;
      const amount: BigNumber = BigNumber.from("100");

      for (let i: number = 0; i < 5; ++i) {
        await depositTokenIntoPrizePool(from, amount);
      }

      for (let i: number = 0; i < 10; ++i) {
        const prevTotalSupply: BigNumber = await ticket.connect(wallet1).totalSupply();
        const prevRewardPerShare: BigNumber = await prizePool.connect(wallet1).getRewardPerShare();
        const prevLastUpdated: BigNumber = await prizePool.connect(wallet1).getLastUpdated();

        const prevUserFromStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(from);
        const prevUserFromBalance: BigNumber = await ticket.connect(wallet1).balanceOf(from);

        const prevUserToStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(to);
        const prevUserToBalance: BigNumber = await ticket.connect(wallet1).balanceOf(to);

        if (i < 5) {
          await ticket.connect(wallet1).transfer(to, amount.div(2));
        } else {
          await ticket.connect(wallet1).approve(wallet3.address, amount.div(2));
          await ticket.connect(wallet3).transferFrom(from, to, amount.div(2));
        }

        const currUserFromStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(from);
        const currUserFromBalance: BigNumber = await ticket.connect(wallet1).balanceOf(from);

        const currUserToStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(to);
        const currUserToBalance: BigNumber = await ticket.connect(wallet1).balanceOf(to);

        const expectedRewardPerShare: BigNumber = await calculateExpectedRewardPerShare(
          prevTotalSupply,
          prevRewardPerShare,
          prevLastUpdated
        );
        const expectedUserFromStakeInfo: UserStakeInfo = await calculateExpectedUserStakeInfo(
          prevUserFromStakeInfo,
          prevUserFromBalance,
          currUserFromBalance
        );
        const expectedUserToStakeInfo: UserStakeInfo = await calculateExpectedUserStakeInfo(
          prevUserToStakeInfo,
          prevUserToBalance,
          currUserToBalance
        );

        expect(await prizePool.connect(wallet1).getRewardPerShare()).to.be.equal(expectedRewardPerShare);
        expect(await prizePool.connect(wallet1).getLastUpdated()).to.be.equal(await getPreviousBlockTimestamp());

        expect(currUserFromStakeInfo.reward).to.be.equal(expectedUserFromStakeInfo.reward);
        expect(currUserFromStakeInfo.former).to.be.equal(expectedUserFromStakeInfo.former);
        expect(currUserFromStakeInfo.lastClaimed).to.be.equal(BigNumber.from(0));

        expect(currUserToStakeInfo.reward).to.be.equal(expectedUserToStakeInfo.reward);
        expect(currUserToStakeInfo.former).to.be.equal(expectedUserToStakeInfo.former);
        expect(currUserToStakeInfo.lastClaimed).to.be.equal(BigNumber.from(0));
      }
    });

    it("should update global reward, user reward and user former, claim reward", async () => {
      await asx.connect(wallet1).transfer(prizePool.address, utils.parseEther("25000000"));

      const user: string = wallet1.address;
      const amount: BigNumber = BigNumber.from("100");

      for (let i: number = 0; i < 5; ++i) {
        await depositTokenIntoPrizePool(user, amount);
      }

      await increaseTime(ethers.provider, claimInterval.toNumber());

      const prevTotalSupply: BigNumber = await ticket.connect(wallet1).totalSupply();
      const prevRewardPerShare: BigNumber = await prizePool.connect(wallet1).getRewardPerShare();
      const prevLastUpdated: BigNumber = await prizePool.connect(wallet1).getLastUpdated();

      const prevPrizePoolBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(prizePool.address);
      const prevUserBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(user);
      const prevUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(user);
      const prevUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(user);

      await prizePool.connect(wallet1).claim(user);

      const currPrizePoolBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(prizePool.address);
      const currUserBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(user);
      const currUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(user);
      const currUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(user);

      const expectedRewardPerShare: BigNumber = await calculateExpectedRewardPerShare(
        prevTotalSupply,
        prevRewardPerShare,
        prevLastUpdated
      );
      const expectedUserStakeInfo: UserStakeInfo = await calculateExpectedUserStakeInfo(
        prevUserStakeInfo,
        prevUserBalance,
        currUserBalance
      );
      const expectedClaimableAmount: BigNumber = expectedUserStakeInfo.reward.div(utils.parseEther("1"));

      expect(await prizePool.connect(wallet1).getRewardPerShare()).to.be.equal(expectedRewardPerShare);
      expect(await prizePool.connect(wallet1).getLastUpdated()).to.be.equal(await getPreviousBlockTimestamp());

      expect(currUserStakeInfo.reward).to.be.equal(
        expectedUserStakeInfo.reward.sub(expectedClaimableAmount.mul(utils.parseEther("1")))
      );
      expect(currUserStakeInfo.former).to.be.equal(expectedUserStakeInfo.former);
      expect(currUserStakeInfo.lastClaimed).to.be.equal(await getPreviousBlockTimestamp());

      expect(currPrizePoolBalanceASX).to.be.equal(prevPrizePoolBalanceASX.sub(expectedClaimableAmount));
      expect(currUserBalanceASX).to.be.equal(prevUserBalanceASX.add(expectedClaimableAmount));
    });

    it("should fail if user is trying to claim too frequent", async () => {
      await asx.connect(wallet1).transfer(prizePool.address, utils.parseEther("25000000"));

      const user: string = wallet1.address;
      const amount: BigNumber = BigNumber.from("100");

      await depositTokenIntoPrizePool(user, amount);

      await increaseTime(ethers.provider, claimInterval.toNumber());

      await prizePool.connect(wallet1).claim(user);

      await expect(prizePool.connect(wallet1).claim(user)).to.be.revertedWith("PrizePool/claim-interval-not-finished");

      await increaseTime(ethers.provider, claimInterval.sub(BigNumber.from(5)).toNumber());

      await expect(prizePool.connect(wallet1).claim(user)).to.be.revertedWith("PrizePool/claim-interval-not-finished");

      await increaseTime(ethers.provider, BigNumber.from(5).toNumber());

      await prizePool.connect(wallet1).claim(user);
    });

    it("should claim full reward balance if there are not enough reward to fully pay to a user", async () => {
      await asx.connect(wallet1).transfer(prizePool.address, utils.parseEther("5"));

      const user: string = wallet1.address;
      const amount: BigNumber = BigNumber.from("100");

      await depositTokenIntoPrizePool(user, amount);

      await increaseTime(ethers.provider, claimInterval.toNumber());

      const prevPrizePoolBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(prizePool.address);
      const prevUserBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(user);
      const prevUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(user);
      const prevUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(user);

      await prizePool.connect(wallet1).claim(user);

      const currPrizePoolBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(prizePool.address);
      const currUserBalanceASX: BigNumber = await asx.connect(wallet1).balanceOf(user);
      const currUserStakeInfo: UserStakeInfo = await prizePool.connect(wallet1).getUserStakeInfo(user);
      const currUserBalance: BigNumber = await ticket.connect(wallet1).balanceOf(user);

      const expectedUserStakeInfo: UserStakeInfo = await calculateExpectedUserStakeInfo(
        prevUserStakeInfo,
        prevUserBalance,
        currUserBalance
      );

      expect(currPrizePoolBalanceASX).to.be.equal(BigNumber.from(0));
      expect(currUserBalanceASX).to.be.equal(prevUserBalanceASX.add(prevPrizePoolBalanceASX));

      expect(currUserStakeInfo.reward).to.be.equal(
        expectedUserStakeInfo.reward.sub(prevPrizePoolBalanceASX.mul(utils.parseEther("1")))
      );
      expect(currUserStakeInfo.former).to.be.equal(expectedUserStakeInfo.former);
      expect(currUserStakeInfo.lastClaimed).to.be.equal(await getPreviousBlockTimestamp());
    });

    it("should not update reward per share after distribution end", async () => {
      const user: string = wallet1.address;
      const amount: BigNumber = BigNumber.from("100");

      await depositTokenIntoPrizePool(user, amount);

      await increaseTime(ethers.provider, await prizePool.connect(wallet1).getDistributionEnd());

      expect(await prizePool.connect(wallet1).getRewardPerShare()).to.be.equal(BigNumber.from(0));

      await prizePool.connect(wallet1).claim(user);

      const finalRewardPerShare: BigNumber = await prizePool.connect(wallet1).getRewardPerShare();

      await prizePool.connect(wallet1).claim(user);

      expect(await prizePool.connect(wallet1).getRewardPerShare()).to.be.equal(finalRewardPerShare);

      await depositTokenIntoPrizePool(user, amount);

      expect(await prizePool.connect(wallet1).getRewardPerShare()).to.be.equal(finalRewardPerShare);
    });
  });
});
