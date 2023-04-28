import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, Contract, ContractFactory } from "ethers";

import { PrizeDistribution } from "./types";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { getSigners } = ethers;

describe("PrizeDistributionBuffer", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;

  let prizeDistributionBuffer: Contract;

  const toBN = (num: any) => BigNumber.from(num);

  const prizeDistribution: PrizeDistribution = {
    numberOfPicks: ethers.utils.parseEther("1"),
    startTimestampOffset: BigNumber.from(0),
    endTimestampOffset: BigNumber.from(3600),
  };

  function newPrizeDistribution(): any {
    return {
      ...prizeDistribution,
    };
  }

  before(async () => {
    [wallet1, wallet2, wallet3] = await getSigners();
  });

  beforeEach(async () => {
    const prizeDistributionBufferFactory: ContractFactory = await ethers.getContractFactory("PrizeDistributionBuffer");

    prizeDistributionBuffer = await upgrades.deployProxy(prizeDistributionBufferFactory, [wallet1.address, 3]);

    await prizeDistributionBuffer.connect(wallet1).setManager(wallet1.address);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        prizeDistributionBuffer.connect(wallet1).initialize(wallet1.address, BigNumber.from(3))
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("getBufferCardinality()", () => {
    it("should read buffer cardinality set in constructor", async () => {
      expect(await prizeDistributionBuffer.connect(wallet1).getBufferCardinality()).to.equal(3);
    });
  });

  describe("getNewestPrizeDistribution()", () => {
    it("should error when no draw buffer", async () => {
      await expect(prizeDistributionBuffer.connect(wallet1).getNewestPrizeDistribution()).to.be.revertedWith(
        "DRB/future-draw"
      );
    });

    it("should get the last draw after pushing a draw", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());

      const settings: any = await prizeDistributionBuffer.connect(wallet1).getNewestPrizeDistribution();

      expect(settings.drawId).to.equal(1);
    });
  });

  describe("getOldestPrizeDistribution()", () => {
    it("should yield an empty draw when no history", async () => {
      const draw: any = await prizeDistributionBuffer.connect(wallet1).getOldestPrizeDistribution();

      expect(draw.drawId).to.equal(0);
    });

    it("should yield the first draw when only one", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(5, newPrizeDistribution());

      const draw: any = await prizeDistributionBuffer.connect(wallet1).getOldestPrizeDistribution();

      expect(draw.drawId).to.equal(5);
    });

    it("should give the first draw when the buffer is not full", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(7, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(8, newPrizeDistribution());

      const draw: any = await prizeDistributionBuffer.connect(wallet1).getOldestPrizeDistribution();

      expect(draw.drawId).to.equal(7);
    });

    it("should give the first draw when the buffer is full", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(9, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(10, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(11, newPrizeDistribution());

      const draw: any = await prizeDistributionBuffer.connect(wallet1).getOldestPrizeDistribution();

      expect(draw.drawId).to.equal(9);
    });

    it("should give the oldest draw when the buffer has wrapped", async () => {
      // Buffer can only hold 3, so the oldest should be drawId 14
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(12, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(13, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(14, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(15, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(16, newPrizeDistribution());

      const draw: any = await prizeDistributionBuffer.connect(wallet1).getOldestPrizeDistribution();

      expect(draw.drawId).to.equal(14);
    });
  });

  describe("pushPrizeDistribution()", () => {
    it("should fail to create a new draw when called from non-draw-manager", async () => {
      const prizeDistributorWallet2: Contract = prizeDistributionBuffer.connect(wallet2);

      await expect(prizeDistributorWallet2.pushPrizeDistribution(1, newPrizeDistribution())).to.be.revertedWith(
        "Manageable/caller-not-manager-or-owner"
      );
    });

    it("should fail if draw ID LT 0", async () => {
      await expect(
        prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(0, newPrizeDistribution())
      ).to.be.revertedWith("PrizeDistributionBuffer/draw-id-gt-0");
    });

    it("should create a new draw and emit DrawCreated", async () => {
      await expect(
        await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution())
      ).to.emit(prizeDistributionBuffer, "PrizeDistributionSet");
    });
  });

  describe("getPrizeDistribution()", () => {
    it("should fail if draw IDs length is wrong", async () => {
      await expect(
        prizeDistributionBuffer.connect(wallet1).getPrizeDistributions(Array(256 + 1).fill(1))
      ).to.be.revertedWith("PrizeDistributionBuffer/wrong-array-length");
    });

    it("should read fail when no draw buffer", async () => {
      await expect(prizeDistributionBuffer.connect(wallet1).getPrizeDistribution(0)).to.revertedWith("DRB/future-draw");
    });

    it("should read the recently created draw struct", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());

      const draw: any = await prizeDistributionBuffer.connect(wallet1).getPrizeDistribution(1);

      expect(toBN(draw[0])).to.equal(toBN(prizeDistribution.startTimestampOffset));
      expect(toBN(draw[1])).to.equal(toBN(prizeDistribution.endTimestampOffset));
      expect(toBN(draw[2])).to.equal(toBN(prizeDistribution.numberOfPicks));
    });
  });

  describe("getPrizeDistributions()", () => {
    it("should fail to read if draws history is empty", async () => {
      await expect(prizeDistributionBuffer.connect(wallet1).getPrizeDistributions([0])).to.revertedWith(
        "DRB/future-draw"
      );
    });

    it("should successfully read an array of draws", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(2, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(3, newPrizeDistribution());

      const draws: any[] = await prizeDistributionBuffer.connect(wallet1).getPrizeDistributions([1, 2, 3]);

      for (let index = 0; index < draws.length; ++index) {
        expect(toBN(draws[index][0])).to.equal(toBN(prizeDistribution.startTimestampOffset));
        expect(toBN(draws[index][1])).to.equal(toBN(prizeDistribution.endTimestampOffset));
        expect(toBN(draws[index][2])).to.equal(toBN(prizeDistribution.numberOfPicks));
      }
    });
  });

  describe("getPrizeDistributionCount()", () => {
    it("should return 0 when no draw buffer", async () => {
      expect(await prizeDistributionBuffer.connect(wallet1).getPrizeDistributionCount()).to.equal(0);
    });

    it("should return 2 if 2 draws have been pushed", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(2, newPrizeDistribution());

      expect(await prizeDistributionBuffer.connect(wallet1).getPrizeDistributionCount()).to.equal(2);
    });

    it("should return 3 if buffer of cardinality 3 is full", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(2, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(3, newPrizeDistribution());

      expect(await prizeDistributionBuffer.connect(wallet1).getPrizeDistributionCount()).to.equal(3);
    });

    it("should return 3 if ring buffer has wrapped", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(2, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(3, newPrizeDistribution());
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(4, newPrizeDistribution());

      expect(await prizeDistributionBuffer.connect(wallet1).getPrizeDistributionCount()).to.equal(3);
    });
  });

  describe("setPrizeDistribution()", () => {
    it("should fail to set existing draw as unauthorized account", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());

      await expect(
        prizeDistributionBuffer.connect(wallet3).setPrizeDistribution(1, newPrizeDistribution())
      ).to.be.revertedWith("Ownable/caller-not-owner");
    });

    it("should fail to set existing draw as manager ", async () => {
      await prizeDistributionBuffer.connect(wallet1).setManager(wallet2.address);
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());

      await expect(
        prizeDistributionBuffer.connect(wallet2).setPrizeDistribution(1, newPrizeDistribution())
      ).to.be.revertedWith("Ownable/caller-not-owner");
    });

    it("should succeed to set existing draw as owner", async () => {
      await prizeDistributionBuffer.connect(wallet1).pushPrizeDistribution(1, newPrizeDistribution());

      await expect(prizeDistributionBuffer.connect(wallet1).setPrizeDistribution(1, newPrizeDistribution())).to.emit(
        prizeDistributionBuffer,
        "PrizeDistributionSet"
      );
    });
  });
});
