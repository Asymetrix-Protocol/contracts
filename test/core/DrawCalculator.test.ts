import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { utils, Contract, BigNumber, ContractFactory } from "ethers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { ethers, artifacts, upgrades } from "hardhat";

import { Draw, PrizeDistribution } from "./types";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const { getSigners } = ethers;

function newDraw(overrides: any): Draw {
  return {
    drawId: 1,
    timestamp: 0,
    beaconPeriodStartedAt: 0,
    beaconPeriodSeconds: 1,
    rngRequestInternalId: 0,
    participantsHash: "0x",
    randomness: [],
    picksNumber: 0,
    isEmpty: false,
    paid: false,
    ...overrides,
  };
}

export async function deployDrawCalculator(
  signer: any,
  ticketAddress: string,
  drawBufferAddress: string,
  prizeDistributionsHistoryAddress: string
): Promise<Contract> {
  const drawCalculatorFactory: ContractFactory = await ethers.getContractFactory("DrawCalculatorHarness", signer);
  const drawCalculator: Contract = await upgrades.deployProxy(drawCalculatorFactory, [
    ticketAddress,
    drawBufferAddress,
    prizeDistributionsHistoryAddress,
  ]);

  return drawCalculator;
}

function modifyTimestampsWithOffset(timestamps: number[], offset: number): number[] {
  return timestamps.map((timestamp: number) => timestamp - offset);
}

describe("DrawCalculator", () => {
  let wallet1: SignerWithAddress;

  let prizeDistributionBuffer: MockContract;
  let drawBuffer: MockContract;
  let ticket: MockContract;

  let drawCalculator: Contract;

  beforeEach(async () => {
    [wallet1] = await getSigners();

    let ticketArtifact: Artifact = await artifacts.readArtifact("Ticket");

    ticket = await deployMockContract(wallet1, ticketArtifact.abi);

    let drawBufferArtifact: Artifact = await artifacts.readArtifact("DrawBuffer");

    drawBuffer = await deployMockContract(wallet1, drawBufferArtifact.abi);

    let prizeDistributionBufferArtifact: Artifact = await artifacts.readArtifact("PrizeDistributionBuffer");

    prizeDistributionBuffer = await deployMockContract(wallet1, prizeDistributionBufferArtifact.abi);

    drawCalculator = await deployDrawCalculator(
      wallet1,
      ticket.address,
      drawBuffer.address,
      prizeDistributionBuffer.address
    );
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        drawCalculator.connect(wallet1).initialize(ticket.address, drawBuffer.address, prizeDistributionBuffer.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        drawCalculator
          .connect(wallet1)
          .testOnlyInitializingModifier(ticket.address, drawBuffer.address, prizeDistributionBuffer.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should require non-zero ticket", async () => {
      await expect(
        deployDrawCalculator(wallet1, ethers.constants.AddressZero, drawBuffer.address, prizeDistributionBuffer.address)
      ).to.be.revertedWith("DrawCalculator/ticket-not-zero");
    });

    it("should require non-zero settings history", async () => {
      await expect(
        deployDrawCalculator(wallet1, ticket.address, drawBuffer.address, ethers.constants.AddressZero)
      ).to.be.revertedWith("DrawCalculator/pdb-not-zero");
    });

    it("should require a non-zero history", async () => {
      await expect(
        deployDrawCalculator(wallet1, ticket.address, ethers.constants.AddressZero, prizeDistributionBuffer.address)
      ).to.be.revertedWith("DrawCalculator/dh-not-zero");
    });
  });

  describe("getDrawBuffer()", () => {
    it("should successfully read draw buffer", async () => {
      expect(await drawCalculator.connect(wallet1).getDrawBuffer()).to.equal(drawBuffer.address);
    });
  });

  describe("getPrizeDistributionBuffer()", () => {
    it("should successfully read prize distribution buffer", async () => {
      expect(await drawCalculator.connect(wallet1).getPrizeDistributionBuffer()).to.equal(
        prizeDistributionBuffer.address
      );
    });
  });

  describe("calculateNumberOfUserPicks()", () => {
    it("should fail if draw IDs length is wrong", async () => {
      await expect(
        drawCalculator.connect(wallet1).calculateNumberOfUserPicks(wallet1.address, Array(256 + 1).fill(1))
      ).to.be.revertedWith("DrawCalculator/wrong-array-length");
    });

    it("calculates the correct number of user picks", async () => {
      const prizeDistribution: PrizeDistribution = {
        numberOfPicks: BigNumber.from("100"),
        startTimestampOffset: BigNumber.from(1),
        endTimestampOffset: BigNumber.from(1),
      };

      await prizeDistributionBuffer.mock.getPrizeDistributions.returns([prizeDistribution, prizeDistribution]);

      const timestamps: number[] = [42, 77];

      const offsetStartTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.startTimestampOffset.toNumber()
      );
      const offsetEndTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.endTimestampOffset.toNumber()
      );

      const draw1: Draw = newDraw({
        drawId: BigNumber.from(1),
        timestamp: BigNumber.from(timestamps[0]),
      });
      const draw2: Draw = newDraw({
        drawId: BigNumber.from(2),
        timestamp: BigNumber.from(timestamps[1]),
      });

      await drawBuffer.mock.getDraws.returns([draw1, draw2]);
      await prizeDistributionBuffer.mock.getPrizeDistributions.returns([prizeDistribution, prizeDistribution]);

      const userAvgBalanceDraw1: BigNumber = utils.parseEther("20");
      const userAvgBalanceDraw2: BigNumber = utils.parseEther("30");
      const totalAvgBalanceDraw1: BigNumber = utils.parseEther("100");
      const totalAvgBalanceDraw2: BigNumber = utils.parseEther("600");

      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, offsetStartTimestamps, offsetEndTimestamps)
        .returns([userAvgBalanceDraw1, userAvgBalanceDraw2]); // (user, timestamp): [balance]

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs(offsetStartTimestamps, offsetEndTimestamps)
        .returns([totalAvgBalanceDraw1, totalAvgBalanceDraw2]);

      const userPicks: BigNumber[] = await drawCalculator
        .connect(wallet1)
        .calculateNumberOfUserPicks(wallet1.address, [1, 2]);

      const picksDraw1: BigNumber = prizeDistribution.numberOfPicks.mul(userAvgBalanceDraw1).div(totalAvgBalanceDraw1);
      const picksDraw2: BigNumber = prizeDistribution.numberOfPicks.mul(userAvgBalanceDraw2).div(totalAvgBalanceDraw2);

      expect(userPicks[0]).to.eq(picksDraw1);
      expect(userPicks[1]).to.eq(picksDraw2);
    });
  });

  describe("getNormalizedBalancesAt()", () => {
    it("should fail if draw IDs length is wrong", async () => {
      await expect(
        drawCalculator.connect(wallet1).getNormalizedBalancesForDrawIds(wallet1.address, Array(256 + 1).fill(1))
      ).to.be.revertedWith("DrawCalculator/wrong-array-length");
    });

    it("should fail if draws and prize distributions lengths are different", async () => {
      const timestamps: number[] = [42, 77];

      const prizeDistribution: PrizeDistribution = {
        numberOfPicks: BigNumber.from("100000"),
        startTimestampOffset: BigNumber.from(1),
        endTimestampOffset: BigNumber.from(1),
      };

      const offsetStartTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.startTimestampOffset.toNumber()
      );
      const offsetEndTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.endTimestampOffset.toNumber()
      );

      const draw1: Draw = newDraw({
        drawId: BigNumber.from(1),
        timestamp: BigNumber.from(timestamps[0]),
      });
      const draw2: Draw = newDraw({
        drawId: BigNumber.from(2),
        timestamp: BigNumber.from(timestamps[1]),
      });

      await drawBuffer.mock.getDraws.returns([draw1, draw2]);
      await prizeDistributionBuffer.mock.getPrizeDistributions.returns([prizeDistribution]);

      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("20"), utils.parseEther("30")]); // (user, timestamp): [balance]

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs(offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("100"), utils.parseEther("600")]);

      await expect(
        drawCalculator.connect(wallet1).getNormalizedBalancesForDrawIds(wallet1.address, [1, 2])
      ).to.be.revertedWith("DrawCalculator/lengths-mismatch");
    });

    it("calculates the correct normalized balance", async () => {
      const timestamps: number[] = [42, 77];

      const prizeDistribution: PrizeDistribution = {
        numberOfPicks: BigNumber.from("100000"),
        startTimestampOffset: BigNumber.from(1),
        endTimestampOffset: BigNumber.from(1),
      };

      const offsetStartTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.startTimestampOffset.toNumber()
      );
      const offsetEndTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.endTimestampOffset.toNumber()
      );

      const draw1: Draw = newDraw({
        drawId: BigNumber.from(1),
        timestamp: BigNumber.from(timestamps[0]),
      });
      const draw2: Draw = newDraw({
        drawId: BigNumber.from(2),
        timestamp: BigNumber.from(timestamps[1]),
      });

      await drawBuffer.mock.getDraws.returns([draw1, draw2]);
      await prizeDistributionBuffer.mock.getPrizeDistributions.returns([prizeDistribution, prizeDistribution]);

      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("20"), utils.parseEther("30")]); // (user, timestamp): [balance]

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs(offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("100"), utils.parseEther("600")]);

      const userNormalizedBalances: BigNumber[] = await drawCalculator
        .connect(wallet1)
        .getNormalizedBalancesForDrawIds(wallet1.address, [1, 2]);

      expect(userNormalizedBalances[0]).to.eq(utils.parseEther("0.2"));
      expect(userNormalizedBalances[1]).to.eq(utils.parseEther("0.05"));
    });

    it("returns 0 when totalSupply is zero", async () => {
      const timestamps: number[] = [42, 77];

      const prizeDistribution: PrizeDistribution = {
        numberOfPicks: BigNumber.from("100000"),
        startTimestampOffset: BigNumber.from(1),
        endTimestampOffset: BigNumber.from(1),
      };

      const offsetStartTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.startTimestampOffset.toNumber()
      );
      const offsetEndTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.endTimestampOffset.toNumber()
      );

      const draw1: Draw = newDraw({
        drawId: BigNumber.from(1),
        timestamp: BigNumber.from(timestamps[0]),
      });
      const draw2: Draw = newDraw({
        drawId: BigNumber.from(2),
        timestamp: BigNumber.from(timestamps[1]),
      });

      await drawBuffer.mock.getDraws.returns([draw1, draw2]);
      await prizeDistributionBuffer.mock.getPrizeDistributions.returns([prizeDistribution, prizeDistribution]);

      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("10"), utils.parseEther("30")]); // (user, timestamp): [balance]

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs(offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("0"), utils.parseEther("600")]);

      const balancesResult: BigNumber[] = await drawCalculator
        .connect(wallet1)
        .getNormalizedBalancesForDrawIds(wallet1.address, [1, 2]);

      expect(balancesResult[0]).to.equal(0);
    });

    it("returns zero when the balance is very small", async () => {
      const timestamps: number[] = [42];

      const prizeDistribution: PrizeDistribution = {
        numberOfPicks: BigNumber.from("100000"),
        startTimestampOffset: BigNumber.from(1),
        endTimestampOffset: BigNumber.from(1),
      };

      const draw1: Draw = newDraw({
        drawId: BigNumber.from(1),
        timestamp: BigNumber.from(timestamps[0]),
      });

      await drawBuffer.mock.getDraws.returns([draw1]);
      await prizeDistributionBuffer.mock.getPrizeDistributions.returns([prizeDistribution]);

      const offsetStartTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.startTimestampOffset.toNumber()
      );
      const offsetEndTimestamps: number[] = modifyTimestampsWithOffset(
        timestamps,
        prizeDistribution.startTimestampOffset.toNumber()
      );

      await ticket.mock.getAverageBalancesBetween
        .withArgs(wallet1.address, offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("0.000000000000000001")]); // (user, timestamp): [balance]

      await ticket.mock.getAverageTotalSuppliesBetween
        .withArgs(offsetStartTimestamps, offsetEndTimestamps)
        .returns([utils.parseEther("1000")]);

      const result: BigNumber[] = await drawCalculator
        .connect(wallet1)
        .getNormalizedBalancesForDrawIds(wallet1.address, [1]);

      expect(result[0]).to.eq(BigNumber.from(0));
    });
  });
});
