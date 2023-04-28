import { Contract, ContractFactory, constants, BigNumber } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { AddressZero } = constants;
const { getSigners } = ethers;

const DRAW_SAMPLE_CONFIG = {
  timestamp: 1111111111,
};

function newDraw(overrides?: any) {
  return {
    drawId: 1,
    timestamp: DRAW_SAMPLE_CONFIG.timestamp,
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

describe("DrawBuffer", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let drawBufferFactory: ContractFactory;

  let drawBuffer: Contract;

  before(async () => {
    [wallet1, wallet2] = await getSigners();
  });

  beforeEach(async () => {
    drawBufferFactory = await ethers.getContractFactory("DrawBufferHarness");
    drawBuffer = await upgrades.deployProxy(drawBufferFactory, [wallet1.address, BigNumber.from(3)]);

    await drawBuffer.setManager(wallet1.address);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(drawBuffer.connect(wallet1).initialize(wallet1.address, BigNumber.from(3))).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        drawBuffer.connect(wallet1)["testOnlyInitializingModifier(address)"](wallet1.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        drawBuffer.connect(wallet1)["testOnlyInitializingModifier(uint8)"](BigNumber.from(3))
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should properly set initial storage values", async () => {
      const owner: string = wallet1.address;
      const bufferCardinality: BigNumber = BigNumber.from(3);

      const drawBuffer: Contract = await upgrades.deployProxy(drawBufferFactory, [owner, bufferCardinality]);

      expect(await drawBuffer.connect(wallet1).owner()).to.equal(owner);
      expect(await drawBuffer.connect(wallet1).getBufferCardinality()).to.equal(bufferCardinality);
    });
  });

  describe("getPrizeDistributor()", () => {
    it("should read PrizeDistributor contract address", async () => {
      expect(await drawBuffer.connect(wallet1).getPrizeDistributor()).to.equal(AddressZero);
    });
  });

  describe("getBufferCardinality()", () => {
    it("should read buffer cardinality set in constructor", async () => {
      expect(await drawBuffer.connect(wallet1).getBufferCardinality()).to.equal(3);
    });
  });

  describe("getNewestDraw()", () => {
    it("should error when no draw buffer", async () => {
      await expect(drawBuffer.connect(wallet1).getNewestDraw()).to.be.revertedWith("DRB/future-draw");
    });

    it("should get the last draw after pushing a draw", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1 }));

      const draw: any = await drawBuffer.connect(wallet1).getNewestDraw();

      expect(draw.drawId).to.equal(1);
      expect(draw.timestamp).to.equal(DRAW_SAMPLE_CONFIG.timestamp);
    });
  });

  describe("getOldestDraw()", () => {
    it("should yield an empty draw when no history", async () => {
      const draw: any = await drawBuffer.connect(wallet1).getOldestDraw();

      expect(draw.drawId).to.equal(0);
      expect(draw.timestamp).to.equal(0);
    });

    it("should yield the first draw when only one", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 2 }));

      const draw: any = await drawBuffer.connect(wallet1).getOldestDraw();

      expect(draw.drawId).to.equal(2);
    });

    it("should give the first draw when the buffer is not full", async () => {
      await drawBuffer.connect(wallet1).addMultipleDraws(1, 2, DRAW_SAMPLE_CONFIG.timestamp);

      const draw: any = await drawBuffer.connect(wallet1).getOldestDraw();

      expect(draw.drawId).to.equal(1);
    });

    it("should give the first draw when the buffer is full", async () => {
      await drawBuffer.connect(wallet1).addMultipleDraws(1, 3, DRAW_SAMPLE_CONFIG.timestamp);

      const draw: any = await drawBuffer.connect(wallet1).getOldestDraw();

      expect(draw.drawId).to.equal(1);
    });

    it("should give the oldest draw when the buffer has wrapped", async () => {
      // Buffer can only hold 3, so the oldest should be draw 3
      await drawBuffer.connect(wallet1).addMultipleDraws(1, 5, DRAW_SAMPLE_CONFIG.timestamp);

      const draw: any = await drawBuffer.connect(wallet1).getOldestDraw();

      expect(draw.drawId).to.equal(3);
    });
  });

  describe("pushDraw()", () => {
    it("should fail to create a new draw when called from non-draw-manager", async () => {
      await expect(drawBuffer.connect(wallet2).pushDraw(newDraw({ drawId: 1 }))).to.be.revertedWith(
        "Manageable/caller-not-manager-or-owner"
      );
    });

    it("should create a new draw and emit DrawCreated", async () => {
      await expect(await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1 })))
        .to.emit(drawBuffer, "DrawSet")
        .withArgs(1, [1, DRAW_SAMPLE_CONFIG.timestamp, 0, 1]);
    });

    it("should create 8 new draws and return valid next draw id", async () => {
      for (let index = 1; index <= 8; index++) {
        await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: index }));

        await drawBuffer.connect(wallet1).getDraw(index);
      }
    });
  });

  describe("getDraw()", () => {
    it("should read fail when no draw buffer", async () => {
      await expect(drawBuffer.connect(wallet1).getDraw(0)).to.revertedWith("DRB/future-draw");
    });

    it("should read the recently created draw struct", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1 }));

      const draw: any = await drawBuffer.connect(wallet1).getDraw(1);

      expect(draw.timestamp).to.equal(DRAW_SAMPLE_CONFIG.timestamp);
      expect(draw.drawId).to.equal(1);
    });
  });

  describe("getDraws()", () => {
    it("should fail to read draws if history is empty", async () => {
      await expect(drawBuffer.connect(wallet1).getDraws([1])).to.revertedWith("DRB/future-draw");
    });

    it("should successfully read an array of draws", async () => {
      await drawBuffer.connect(wallet1).addMultipleDraws(1, 2, DRAW_SAMPLE_CONFIG.timestamp);

      const draws: any[] = await drawBuffer.connect(wallet1).getDraws([1, 2]);

      for (let index: number = 0; index < draws.length; ++index) {
        expect(draws[index].timestamp).to.equal(DRAW_SAMPLE_CONFIG.timestamp);
        expect(draws[index].drawId).to.equal(index + 1);
      }
    });

    it("should fail if draw IDs length is wrong", async () => {
      await drawBuffer.connect(wallet1).addMultipleDraws(1, 1, DRAW_SAMPLE_CONFIG.timestamp);

      await expect(drawBuffer.connect(wallet1).getDraws(Array(256 + 1).fill(1))).to.be.revertedWith(
        "DrawBuffer/wrong-array-length"
      );
    });

    it("should work with maximum draw IDs number", async () => {
      drawBuffer = await upgrades.deployProxy(drawBufferFactory, [wallet1.address, BigNumber.from(255)]);

      await drawBuffer.connect(wallet1).addMultipleDraws(1, 255, DRAW_SAMPLE_CONFIG.timestamp);

      let arr: Array<number> = new Array<number>();

      for (let i: number = 1; i <= 256; ++i) {
        arr.push(i);
      }

      const draws: any[] = await drawBuffer.connect(wallet1).getDraws([]);

      for (let index: number = 0; index < draws.length; ++index) {
        expect(draws[index].timestamp).to.equal(DRAW_SAMPLE_CONFIG.timestamp);
        expect(draws[index].drawId).to.equal(index + 1);
      }
    });
  });

  describe("getDrawCount()", () => {
    it("should return 0 when no draw buffer", async () => {
      expect(await drawBuffer.connect(wallet1).getDrawCount()).to.equal(0);
    });

    it("should return 2 if 2 draws have been pushed", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1 }));
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 2 }));

      expect(await drawBuffer.connect(wallet1).getDrawCount()).to.equal(2);
    });

    it("should return 3 if buffer of cardinality 3 is full", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1 }));
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 2 }));
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 3 }));

      expect(await drawBuffer.connect(wallet1).getDrawCount()).to.equal(3);
    });

    it("should return 3 if ring buffer has wrapped", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1 }));
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 2 }));
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 3 }));
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 4 }));

      expect(await drawBuffer.connect(wallet1).getDrawCount()).to.equal(3);
    });
  });

  describe("setDraw()", () => {
    it("should fail to set existing draw as unauthorized account", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1 }));

      await expect(drawBuffer.connect(wallet2).setDraw(newDraw({ drawId: 1, timestamp: 2 }))).to.be.revertedWith(
        "DrawBuffer/caller-is-not-owner-nor-prize-distributor"
      );
    });

    it("should fail to set existing draw as manager", async () => {
      await drawBuffer.connect(wallet1).setManager(wallet2.address);

      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1, timestamp: 1 }));

      await expect(drawBuffer.connect(wallet2).setDraw(newDraw({ drawId: 1, timestamp: 2 }))).to.be.revertedWith(
        "DrawBuffer/caller-is-not-owner-nor-prize-distributor"
      );
    });

    it("should succeed to set existing draw as owner", async () => {
      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1, timestamp: 1 }));

      const draw: any = newDraw({
        drawId: 1,
        timestamp: DRAW_SAMPLE_CONFIG.timestamp,
      });

      await expect(drawBuffer.connect(wallet1).setDraw(draw))
        .to.emit(drawBuffer, "DrawSet")
        .withArgs(1, [1, DRAW_SAMPLE_CONFIG.timestamp, 0, 1]);
    });

    it("should succeed to set existing draw as prize distributor", async () => {
      await drawBuffer.connect(wallet1).setPrizeDistributor(wallet2.address);

      await drawBuffer.connect(wallet1).pushDraw(newDraw({ drawId: 1, timestamp: 1 }));

      const draw: any = newDraw({
        drawId: 1,
        timestamp: DRAW_SAMPLE_CONFIG.timestamp,
      });

      await expect(drawBuffer.connect(wallet2).setDraw(draw))
        .to.emit(drawBuffer, "DrawSet")
        .withArgs(1, [1, DRAW_SAMPLE_CONFIG.timestamp, 0, 1]);
    });
  });

  describe("setPrizeDistributor()", () => {
    it("should fail if not an owner is trying to set a PrizeDistributor", async () => {
      await expect(drawBuffer.connect(wallet2).setPrizeDistributor(wallet2.address)).to.be.revertedWith(
        "Ownable/caller-not-owner"
      );
    });

    it("should fail if a new PrizeDistributor is address zero", async () => {
      await expect(drawBuffer.connect(wallet1).setPrizeDistributor(AddressZero)).to.be.revertedWith(
        "DrawBuffer/prize-distributor-not-zero-address"
      );
    });

    it("should properly set a new PrizeDistributor by an owner", async () => {
      await expect(drawBuffer.connect(wallet1).setPrizeDistributor(wallet1.address))
        .to.emit(drawBuffer, "PrizeDistributorSet")
        .withArgs(wallet1.address);

      expect(await drawBuffer.connect(wallet1).getPrizeDistributor()).to.equal(wallet1.address);
    });
  });

  describe("markDrawAsPaid()", () => {
    it("should fail if not a PrizeDistributor is trying to mark a draw as paid", async () => {
      await expect(drawBuffer.connect(wallet1).markDrawAsPaid(BigNumber.from(0))).to.be.revertedWith(
        "DrawBuffer/caller-is-not-prize-distributor"
      );
    });

    it("should fail if a draw already is marked as paid", async () => {
      await drawBuffer.connect(wallet1).setPrizeDistributor(wallet1.address);

      await drawBuffer.connect(wallet1).pushDraw(newDraw({ paid: true }));

      await expect(drawBuffer.connect(wallet1).markDrawAsPaid(BigNumber.from(1))).to.be.revertedWith(
        "DrawBuffer/already-marked-as-paid"
      );
    });

    it("should mark a draw as paid", async () => {
      await drawBuffer.connect(wallet1).setPrizeDistributor(wallet1.address);

      await drawBuffer.connect(wallet1).pushDraw(newDraw());

      const drawId: BigNumber = BigNumber.from(1);

      await expect(drawBuffer.connect(wallet1).markDrawAsPaid(drawId))
        .to.emit(drawBuffer, "DrawMarkedAsPaid")
        .withArgs(drawId);

      expect((await drawBuffer.connect(wallet1.address).getDraw(drawId)).paid).to.be.equal(true);
    });
  });
});
