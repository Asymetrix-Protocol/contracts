import { BigNumber, Contract, ContractFactory, constants } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { TransactionResponse } from "@ethersproject/providers";

import { ethers, artifacts, upgrades } from "hardhat";

import { Artifact } from "hardhat/types";

import { Draw } from "../core/types";

import { expect } from "chai";

const { AddressZero } = constants;
const { getSigners } = ethers;

describe("BeaconTimelockTrigger", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let BeaconTimelockTriggerFactory: ContractFactory;

  let drawAndPrizeDistributionTimelock: Contract;

  let prizeDistributionFactory: MockContract;
  let drawCalculatorTimelock: MockContract;

  let initializeTx: TransactionResponse;

  beforeEach(async () => {
    [wallet1, wallet2] = await getSigners();

    const PrizeDistributionFactory: Artifact = await artifacts.readArtifact("IPrizeDistributionFactory");

    prizeDistributionFactory = await deployMockContract(wallet1, PrizeDistributionFactory.abi);

    const DrawCalculatorTimelock: Artifact = await artifacts.readArtifact("DrawCalculatorTimelock");

    drawCalculatorTimelock = await deployMockContract(wallet1, DrawCalculatorTimelock.abi);

    BeaconTimelockTriggerFactory = await ethers.getContractFactory("BeaconTimelockTriggerHarness");
    drawAndPrizeDistributionTimelock = await upgrades.deployProxy(BeaconTimelockTriggerFactory, [
      wallet1.address,
      prizeDistributionFactory.address,
      drawCalculatorTimelock.address,
    ]);

    initializeTx = drawAndPrizeDistributionTimelock.deployTransaction;
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        drawAndPrizeDistributionTimelock
          .connect(wallet1)
          .initialize(wallet1.address, prizeDistributionFactory.address, drawCalculatorTimelock.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if `_prizeDistributionFactory` is zero address", async () => {
      await expect(
        upgrades.deployProxy(BeaconTimelockTriggerFactory, [
          wallet1.address,
          AddressZero,
          drawCalculatorTimelock.address,
        ])
      ).to.be.revertedWith("BeaconTimelockTrigger/can-not-be-zero-address");
    });

    it("should fail if `_timelock` is zero address", async () => {
      await expect(
        upgrades.deployProxy(BeaconTimelockTriggerFactory, [
          wallet1.address,
          prizeDistributionFactory.address,
          AddressZero,
        ])
      ).to.be.revertedWith("BeaconTimelockTrigger/can-not-be-zero-address");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        drawAndPrizeDistributionTimelock
          .connect(wallet1)
          .testOnlyInitializingModifier(
            wallet1.address,
            prizeDistributionFactory.address,
            drawCalculatorTimelock.address
          )
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should deploy BeaconTimelockTrigger contract and properly initialize it", async () => {
      await expect(initializeTx)
        .to.emit(drawAndPrizeDistributionTimelock, "Deployed")
        .withArgs(prizeDistributionFactory.address, drawCalculatorTimelock.address);

      expect(await drawAndPrizeDistributionTimelock.connect(wallet1).prizeDistributionFactory()).to.equal(
        prizeDistributionFactory.address
      );
      expect(await drawAndPrizeDistributionTimelock.connect(wallet1).timelock()).to.equal(
        drawCalculatorTimelock.address
      );
    });
  });

  describe("push()", () => {
    const draw: Draw = {
      drawId: ethers.BigNumber.from(0),
      timestamp: ethers.BigNumber.from(10),
      beaconPeriodStartedAt: BigNumber.from(Math.floor(new Date().getTime() / 1000)),
      beaconPeriodSeconds: BigNumber.from(1000),
      rngRequestInternalId: BigNumber.from(0),
      participantsHash: "0x",
      randomness: [],
      picksNumber: BigNumber.from(0),
      isEmpty: false,
      paid: false,
    };

    it("should fail if a draw is not locked inside of timelock contract", async () => {
      await prizeDistributionFactory.mock.pushPrizeDistribution.returns();

      await drawCalculatorTimelock.mock.lock.returns(false);

      await expect(
        drawAndPrizeDistributionTimelock.connect(wallet1).push(draw, BigNumber.from(1000000))
      ).to.be.revertedWith("BeaconTimelockTrigger/draw-is-not-locked");
    });

    it("should allow a push when no push has happened", async () => {
      await prizeDistributionFactory.mock.pushPrizeDistribution.returns();

      await drawCalculatorTimelock.mock.lock.returns(true);

      await expect(drawAndPrizeDistributionTimelock.connect(wallet1).push(draw, BigNumber.from(1000000))).to.emit(
        drawAndPrizeDistributionTimelock,
        "DrawLockedAndTotalNetworkTicketSupplyPushed"
      );
    });

    it("should not allow a push from a non-owner", async () => {
      await expect(
        drawAndPrizeDistributionTimelock.connect(wallet2).push(draw, BigNumber.from(1000000))
      ).to.be.revertedWith("Manageable/caller-not-manager-or-owner");
    });

    it("should not allow a push if a draw is still timelocked", async () => {
      await drawCalculatorTimelock.mock.lock.revertsWithReason("OM/timelock-not-expired");

      await prizeDistributionFactory.mock.pushPrizeDistribution.returns();

      await expect(
        drawAndPrizeDistributionTimelock.connect(wallet1).push(draw, BigNumber.from(1000000))
      ).to.be.revertedWith("OM/timelock-not-expired");
    });
  });
});
