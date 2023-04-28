import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { ethers, artifacts, network, upgrades } from "hardhat";

import { Draw, PrizeDistribution } from "../core/types";

import { BigNumber } from "@ethersproject/bignumber";

import { Contract, ContractFactory } from "ethers";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const { getSigners, utils } = ethers;
const { parseEther: toWei } = utils;

describe("PrizeDistributionFactory", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let prizeDistributionFactory: Contract;
  let maxPickCost: BigNumber;

  let prizeDistributionFactoryFactory: ContractFactory;

  let prizeDistributionBuffer: MockContract;
  let drawBeacon: MockContract;
  let drawBuffer: MockContract;
  let ticket: MockContract;

  let endTimestampOffset: number;

  before(async () => {
    [wallet1, wallet2] = await getSigners();

    prizeDistributionFactoryFactory = await ethers.getContractFactory("PrizeDistributionFactory");
  });

  beforeEach(async () => {
    const IDrawBuffer: Artifact = await artifacts.readArtifact("IDrawBuffer");
    const IPrizeDistributionBuffer: Artifact = await artifacts.readArtifact("IPrizeDistributionBuffer");
    const IDrawBeacon: Artifact = await artifacts.readArtifact("IDrawBeacon");
    const ITicket: Artifact = await artifacts.readArtifact("ITicket");

    drawBuffer = await deployMockContract(wallet1, IDrawBuffer.abi);
    prizeDistributionBuffer = await deployMockContract(wallet1, IPrizeDistributionBuffer.abi);
    drawBeacon = await deployMockContract(wallet1, IDrawBeacon.abi);
    ticket = await deployMockContract(wallet1, ITicket.abi);

    maxPickCost = toWei("1");

    endTimestampOffset = 5 * 60; // 5 minutes

    prizeDistributionFactory = await upgrades.deployProxy(prizeDistributionFactoryFactory, [
      wallet1.address,
      drawBuffer.address,
      prizeDistributionBuffer.address,
      drawBeacon.address,
      ticket.address,
      maxPickCost,
      endTimestampOffset,
    ]);
  });

  const drawDefault: Draw = {
    drawId: BigNumber.from(1),
    timestamp: BigNumber.from(1000),
    beaconPeriodStartedAt: BigNumber.from(0),
    beaconPeriodSeconds: BigNumber.from(100),
    rngRequestInternalId: BigNumber.from(0),
    participantsHash: "0x",
    randomness: [],
    picksNumber: BigNumber.from(0),
    isEmpty: false,
    paid: false,
  };

  const prizeTierDefault: any = {
    drawId: BigNumber.from(1),
    endTimestampOffset: BigNumber.from(300),
    prize: toWei("10"),
  };

  function createPrizeDistribution(prizeDistributionOptions: any = {}): PrizeDistribution {
    return {
      startTimestampOffset: drawDefault.beaconPeriodSeconds,
      endTimestampOffset: prizeTierDefault.endTimestampOffset,
      numberOfPicks: ethers.BigNumber.from(1000),
      ...prizeDistributionOptions,
    };
  }

  function toObject(prizeDistributionResult: any): any {
    const { startTimestampOffset, endTimestampOffset, numberOfPicks, prize } = prizeDistributionResult;

    return {
      startTimestampOffset: BigNumber.from(startTimestampOffset || 0),
      endTimestampOffset: BigNumber.from(endTimestampOffset || 0),
      numberOfPicks: BigNumber.from(numberOfPicks || 0),
      prize: prize ? BigNumber.from(prize) : undefined,
    };
  }

  async function setupMocks(
    drawOptions = {},
    prizeTierOptions = {},
    totalSupply: BigNumber = toWei("1000")
  ): Promise<void> {
    const draw: Draw = {
      ...drawDefault,
      ...drawOptions,
    };

    await drawBuffer.mock.getDraw.withArgs(draw.drawId).returns(draw);

    const prizeTier: any = {
      ...prizeTierDefault,
      ...prizeTierOptions,
    };

    await ticket.mock.getAverageTotalSuppliesBetween
      .withArgs([draw.timestamp.sub(draw.beaconPeriodSeconds)], [draw.timestamp.sub(prizeTier.endTimestampOffset)])
      .returns([totalSupply]);
  }

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        prizeDistributionFactory
          .connect(wallet1)
          .initialize(
            wallet1.address,
            drawBuffer.address,
            prizeDistributionBuffer.address,
            drawBeacon.address,
            ticket.address,
            maxPickCost,
            endTimestampOffset
          )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("requires a pick cost > 0", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributionFactoryFactory, [
          wallet1.address,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          drawBeacon.address,
          ticket.address,
          0,
          endTimestampOffset,
        ])
      ).to.be.revertedWith("PDC/pick-cost-gt-zero");
    });

    it("requires owner != 0x0", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributionFactoryFactory, [
          ethers.constants.AddressZero,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          drawBeacon.address,
          ticket.address,
          maxPickCost,
          endTimestampOffset,
        ])
      ).to.be.revertedWith("PDC/owner-zero");
    });

    it("requires draw buffer != 0x0", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributionFactoryFactory, [
          wallet1.address,
          ethers.constants.AddressZero,
          prizeDistributionBuffer.address,
          drawBeacon.address,
          ticket.address,
          maxPickCost,
          endTimestampOffset,
        ])
      ).to.be.revertedWith("PDC/db-zero");
    });

    it("requires prize dist buffer != 0x0", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributionFactoryFactory, [
          wallet1.address,
          drawBuffer.address,
          ethers.constants.AddressZero,
          drawBeacon.address,
          ticket.address,
          maxPickCost,
          endTimestampOffset,
        ])
      ).to.be.revertedWith("PDC/pdb-zero");
    });

    it("requires draw beacon != 0x0", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributionFactoryFactory, [
          wallet1.address,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          ethers.constants.AddressZero,
          ticket.address,
          maxPickCost,
          endTimestampOffset,
        ])
      ).to.be.revertedWith("PDC/drawBeacon-zero");
    });

    it("requires ticket != 0x0", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributionFactoryFactory, [
          wallet1.address,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          drawBeacon.address,
          ethers.constants.AddressZero,
          maxPickCost,
          endTimestampOffset,
        ])
      ).to.be.revertedWith("PDC/ticket-zero");
    });
  });

  describe("calculatePrizeDistribution()", () => {
    it("should copy in all of the prize tier values", async () => {
      await setupMocks();

      const prizeDistributionObject: any = toObject(
        await prizeDistributionFactory.connect(wallet1).calculatePrizeDistribution(1)
      );
      const prizeDistribution: PrizeDistribution = createPrizeDistribution();

      expect(JSON.stringify(prizeDistributionObject)).to.equal(JSON.stringify(prizeDistribution));
    });

    it("ensure minimum cardinality is 1", async () => {
      const totalSupply: BigNumber = toWei("0");

      await setupMocks({}, {}, totalSupply);

      const minPickCost: BigNumber = await prizeDistributionFactory.connect(wallet1).minPickCost();
      const prizeDistributionObject: any = toObject(
        await prizeDistributionFactory.connect(wallet1).calculatePrizeDistribution(1)
      );
      const prizeDistribution: PrizeDistribution = createPrizeDistribution({
        numberOfPicks: totalSupply.div(minPickCost),
      });

      expect(JSON.stringify(prizeDistributionObject)).to.equal(JSON.stringify(prizeDistribution));
    });

    it("should handle the pick cost of 1 eth and supply of 100 ether", async () => {
      const totalSupply: BigNumber = toWei("100");

      await setupMocks({}, {}, totalSupply);

      const minPickCost: BigNumber = await prizeDistributionFactory.connect(wallet1).minPickCost();
      const prizeDistributionObject: any = toObject(
        await prizeDistributionFactory.connect(wallet1).calculatePrizeDistribution(1)
      );
      const prizeDistribution: PrizeDistribution = createPrizeDistribution({
        numberOfPicks: totalSupply.div(minPickCost),
      });

      expect(JSON.stringify(prizeDistributionObject)).to.equal(JSON.stringify(prizeDistribution));
    });

    it("should handle the pick cost of 1 eth and supply of 1 ether", async () => {
      const totalSupply: BigNumber = toWei("1");

      await setupMocks({}, {}, totalSupply);

      const minPickCost: BigNumber = await prizeDistributionFactory.connect(wallet1).minPickCost();
      const prizeDistributionObject: any = toObject(
        await prizeDistributionFactory.connect(wallet1).calculatePrizeDistribution(1)
      );
      const prizeDistribution: PrizeDistribution = createPrizeDistribution({
        numberOfPicks: totalSupply.div(minPickCost),
      });

      expect(JSON.stringify(prizeDistributionObject)).to.equal(JSON.stringify(prizeDistribution));
    });
  });

  describe("pushPrizeDistribution()", () => {
    it("should fail if prize distribution is not pushed into the PrizeDistributioBuffer", async () => {
      await setupMocks();

      await prizeDistributionBuffer.mock.pushPrizeDistribution.returns(false);

      await expect(
        prizeDistributionFactory.connect(wallet1).pushPrizeDistribution(1, toWei("1000"))
      ).to.be.revertedWith("PDC/prize-distribution-is-not-pushed");
    });

    it("should push the prize distribution onto the buffer", async () => {
      await setupMocks();

      await prizeDistributionBuffer.mock.pushPrizeDistribution.returns(true);

      await expect(prizeDistributionFactory.connect(wallet1).pushPrizeDistribution(1, toWei("1000")))
        .to.emit(prizeDistributionFactory, "PrizeDistributionPushed")
        .withArgs(1, toWei("1000"));
    });

    it("requires the manager or owner", async () => {
      await expect(
        prizeDistributionFactory.connect(wallet2).pushPrizeDistribution(1, toWei("1000"))
      ).to.be.revertedWith("Manageable/caller-not-manager-or-owner");
    });
  });

  describe("setPrizeDistribution()", () => {
    it("should push the prize distribution onto the buffer", async () => {
      await setupMocks();

      await prizeDistributionBuffer.mock.setPrizeDistribution.returns(1);

      await expect(prizeDistributionFactory.connect(wallet1).setPrizeDistribution(1))
        .to.emit(prizeDistributionFactory, "PrizeDistributionSet")
        .withArgs(1);
    });

    it("requires the owner", async () => {
      await expect(prizeDistributionFactory.connect(wallet2).setPrizeDistribution(1)).to.be.revertedWith(
        "Ownable/caller-not-owner"
      );
    });
  });

  describe("setMinPickCost()", () => {
    it("should get min pick cost", async () => {
      const minPickCost: BigNumber = await prizeDistributionFactory.connect(wallet1).minPickCost();

      expect(minPickCost).to.equal(maxPickCost);
    });

    it("should set min pick cost", async () => {
      const minPickCostBefore: BigNumber = await prizeDistributionFactory.connect(wallet1).minPickCost();
      const newMinPickCost: BigNumber = BigNumber.from(100000);

      await expect(prizeDistributionFactory.connect(wallet1).setMinPickCost(newMinPickCost))
        .to.emit(prizeDistributionFactory, "MinPickCostSet")
        .withArgs(newMinPickCost);

      const minPickCostAfter: BigNumber = await prizeDistributionFactory.connect(wallet1).minPickCost();

      expect(minPickCostBefore).to.equal(maxPickCost);
      expect(minPickCostAfter).to.equal(newMinPickCost);
    });

    it("requires min pick cost to be greater than 0", async () => {
      await expect(prizeDistributionFactory.connect(wallet1).setMinPickCost(0)).to.be.revertedWith(
        "PDC/pick-cost-gt-zero"
      );
    });

    it("requires the owner", async () => {
      await expect(prizeDistributionFactory.connect(wallet2).setMinPickCost(1)).to.be.revertedWith(
        "Ownable/caller-not-owner"
      );
    });
  });

  describe("setEndTimestampOffset()", () => {
    it("should get end timestamp offset", async () => {
      const obtainedEndTimestampOffset: BigNumber = await prizeDistributionFactory
        .connect(wallet1)
        .endTimestampOffset();

      expect(obtainedEndTimestampOffset).to.equal(endTimestampOffset);
    });

    it("should set end timestamp offset", async () => {
      const obtainedEndTimestampOffsetBefore: BigNumber = await prizeDistributionFactory
        .connect(wallet1)
        .endTimestampOffset();
      const newEndTimestampOffset: BigNumber = BigNumber.from(100000);

      await expect(prizeDistributionFactory.connect(wallet1).setEndTimestampOffset(newEndTimestampOffset))
        .to.emit(prizeDistributionFactory, "SetEndTimestampOffset")
        .withArgs(newEndTimestampOffset);

      const obtainedEndTimestampOffsetAfter: BigNumber = await prizeDistributionFactory
        .connect(wallet1)
        .endTimestampOffset();

      expect(obtainedEndTimestampOffsetBefore).to.equal(endTimestampOffset);
      expect(obtainedEndTimestampOffsetAfter).to.equal(newEndTimestampOffset);
    });

    it("requires the owner", async () => {
      await expect(prizeDistributionFactory.connect(wallet2).setEndTimestampOffset(1)).to.be.revertedWith(
        "Ownable/caller-not-owner"
      );
    });
  });

  describe("estimatePartialPicks()", () => {
    let minPickCost: BigNumber;
    let beaconPeriodSeconds: number;
    let totalSupply: BigNumber;
    let userBalance: BigNumber;
    let estimatedTotalPicks: BigNumber;
    let estimatedUserPicks: BigNumber;
    let currentTime: number;

    beforeEach(async () => {
      minPickCost = toWei("0.1");

      await prizeDistributionFactory.connect(wallet1).setMinPickCost(minPickCost);

      const currentBlockNumber: number = await ethers.provider.getBlockNumber();

      currentTime = (await ethers.provider.getBlock(currentBlockNumber)).timestamp + 10000;
      beaconPeriodSeconds = 14400;
      totalSupply = toWei("1000");
      userBalance = toWei("500"); // 50%
      estimatedTotalPicks = totalSupply.div(minPickCost);
      estimatedUserPicks = userBalance.mul(toWei("1")).div(totalSupply).mul(estimatedTotalPicks).div(toWei("1"));
    });

    it("should return zeros if total supply is zero", async () => {
      const getBeaconPeriodStartedAt: number = currentTime - beaconPeriodSeconds;

      await drawBeacon.mock.getBeaconPeriodSeconds.returns(beaconPeriodSeconds);
      await drawBeacon.mock.getBeaconPeriodStartedAt.returns(getBeaconPeriodStartedAt);

      await network.provider.send("evm_setNextBlockTimestamp", [currentTime - 1]);

      const startTimestamp: number = getBeaconPeriodStartedAt;
      const endTimestamp: number = startTimestamp + beaconPeriodSeconds - endTimestampOffset;

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs([startTimestamp], [endTimestamp])
        .returns([BigNumber.from(0)]);
      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, [startTimestamp], [endTimestamp])
        .returns([BigNumber.from(0)]);

      const estimatedPicks: any = await prizeDistributionFactory.connect(wallet1).estimatePartialPicks(wallet1.address);

      expect(estimatedPicks.totalPicks).to.equal(BigNumber.from(0));
      expect(estimatedPicks.userPicks).to.equal(BigNumber.from(0));
    });

    it("should calculate the user and total pickk, 100% of time, 50% deposit amount", async () => {
      const getBeaconPeriodStartedAt: number = currentTime - beaconPeriodSeconds;

      await drawBeacon.mock.getBeaconPeriodSeconds.returns(beaconPeriodSeconds);
      await drawBeacon.mock.getBeaconPeriodStartedAt.returns(getBeaconPeriodStartedAt);

      await network.provider.send("evm_setNextBlockTimestamp", [currentTime - 1]);

      const startTimestamp: number = getBeaconPeriodStartedAt;
      const endTimestamp: number = startTimestamp + beaconPeriodSeconds - endTimestampOffset;

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs([startTimestamp], [endTimestamp])
        .returns([totalSupply]);
      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, [startTimestamp], [endTimestamp])
        .returns([userBalance]);

      const estimatedPicks: any = await prizeDistributionFactory.connect(wallet1).estimatePartialPicks(wallet1.address);

      expect(estimatedPicks.totalPicks).to.equal(estimatedTotalPicks);
      expect(estimatedPicks.userPicks).to.equal(estimatedUserPicks);
    });

    it("should calculate the user and total picks, beacon already passed", async () => {
      const getBeaconPeriodStartedAt: number = currentTime - (beaconPeriodSeconds + 10);

      await drawBeacon.mock.getBeaconPeriodSeconds.returns(beaconPeriodSeconds);
      await drawBeacon.mock.getBeaconPeriodStartedAt.returns(getBeaconPeriodStartedAt);

      await network.provider.send("evm_setNextBlockTimestamp", [currentTime - 1]);

      const startTimestamp: number = currentTime - beaconPeriodSeconds;
      const endTimestamp: number = startTimestamp + beaconPeriodSeconds - endTimestampOffset;

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs([startTimestamp], [endTimestamp])
        .returns([totalSupply]);
      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, [startTimestamp], [endTimestamp])
        .returns([userBalance]);

      const estimatedPicks: any = await prizeDistributionFactory.connect(wallet1).estimatePartialPicks(wallet1.address);

      expect(estimatedPicks.totalPicks).to.equal(estimatedTotalPicks);
      expect(estimatedPicks.userPicks).to.equal(estimatedUserPicks);
    });

    it("should calculate the user and total picks of an unfinished draw", async () => {
      const getBeaconPeriodStartedAt: number = currentTime - beaconPeriodSeconds / 2;

      await drawBeacon.mock.getBeaconPeriodSeconds.returns(beaconPeriodSeconds);
      await drawBeacon.mock.getBeaconPeriodStartedAt.returns(getBeaconPeriodStartedAt);

      await network.provider.send("evm_setNextBlockTimestamp", [currentTime - 1]);

      const startTimestamp: number = getBeaconPeriodStartedAt;
      const endTimestamp: number = startTimestamp + beaconPeriodSeconds - endTimestampOffset;

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs([startTimestamp], [endTimestamp])
        .returns([totalSupply]);
      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, [startTimestamp], [endTimestamp])
        .returns([userBalance]);

      const estimatedPicks: any = await prizeDistributionFactory.connect(wallet1).estimatePartialPicks(wallet1.address);

      expect(estimatedPicks.totalPicks).to.equal(estimatedTotalPicks);
      expect(estimatedPicks.userPicks).to.equal(estimatedUserPicks);
    });
  });
});
