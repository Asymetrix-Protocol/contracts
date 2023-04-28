import { Contract, ContractFactory } from "ethers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

describe("DrawRingBufferLib", () => {
  let DrawRingBufferLibFactory: ContractFactory;
  let RingBufferLibFactory: ContractFactory;

  let DrawRingBufferLib: Contract;
  let RingBufferLib: Contract;

  before(async () => {
    DrawRingBufferLibFactory = await ethers.getContractFactory("DrawRingBufferLibHarness");
    RingBufferLibFactory = await ethers.getContractFactory("RingBufferLibHarness");
  });

  beforeEach(async () => {
    DrawRingBufferLib = await upgrades.deployProxy(DrawRingBufferLibFactory, ["255"]);
    RingBufferLib = await upgrades.deployProxy(RingBufferLibFactory, []);
  });

  describe("isInitialized()", () => {
    it("should return TRUE to signal an initalized DrawBuffer", async () => {
      expect(
        await DrawRingBufferLib._isInitialized({
          lastDrawId: 1,
          nextIndex: 1,
          cardinality: 256,
        })
      ).to.eql(true);
    });

    it("should return FALSE to signal an uninitalized DrawBuffer", async () => {
      expect(
        await DrawRingBufferLib._isInitialized({
          lastDrawId: 0,
          nextIndex: 0,
          cardinality: 256,
        })
      ).to.eql(false);
    });
  });

  describe("push()", () => {
    it("should return the next valid Buffer struct assuming DrawBuffer with 0 draws", async () => {
      const nextBuffer: any = await DrawRingBufferLib._push(
        {
          lastDrawId: 0,
          nextIndex: 0,
          cardinality: 256,
        },
        0
      );

      expect(nextBuffer.lastDrawId).to.eql(0);
      expect(nextBuffer.nextIndex).to.eql(1);
      expect(nextBuffer.cardinality).to.eql(256);
    });

    it("should return the next valid Buffer struct assuming DrawBuffer with 1 draws", async () => {
      const nextBuffer: any = await DrawRingBufferLib._push(
        {
          lastDrawId: 0,
          nextIndex: 1,
          cardinality: 256,
        },
        1
      );

      expect(nextBuffer.lastDrawId).to.eql(1);
      expect(nextBuffer.nextIndex).to.eql(2);
      expect(nextBuffer.cardinality).to.eql(256);
    });

    it("should return the next valid Buffer struct assuming DrawBuffer with 255 draws", async () => {
      const nextBuffer: any = await DrawRingBufferLib._push(
        {
          lastDrawId: 255,
          nextIndex: 255,
          cardinality: 256,
        },
        256
      );

      expect(nextBuffer.lastDrawId).to.eql(256);
      expect(nextBuffer.nextIndex).to.eql(0);
      expect(nextBuffer.cardinality).to.eql(256);
    });

    it("should fail to create new Buffer struct due to not contiguous Draw ID", async () => {
      const Buffer: any = {
        lastDrawId: 0,
        nextIndex: 1,
        cardinality: 256,
      };

      expect(DrawRingBufferLib._push(Buffer, 4)).to.be.revertedWith("DRB/must-be-contig");
    });
  });

  describe("getIndex()", () => {
    it("should return valid draw index assuming DrawBuffer with 1 draw", async () => {
      const Buffer: any = {
        lastDrawId: 0,
        nextIndex: 1,
        cardinality: 256,
      };

      expect(await DrawRingBufferLib._getIndex(Buffer, 0)).to.eql(0);
    });

    it("should return valid draw index assuming DrawBuffer with 255 draws", async () => {
      const Buffer: any = {
        lastDrawId: 255,
        nextIndex: 0,
        cardinality: 256,
      };

      expect(await DrawRingBufferLib._getIndex(Buffer, 255)).to.eql(255);
    });

    it("should return proper newest index if cardinality is equal to zero", async () => {
      expect(await RingBufferLib.newestIndex()).to.eq(0);
    });

    it("should fail to return index since Draw has not been pushed", async () => {
      expect(
        DrawRingBufferLib._getIndex(
          {
            lastDrawId: 1,
            nextIndex: 2,
            cardinality: 256,
          },
          255
        )
      ).to.be.revertedWith("DRB/future-draw");
    });

    it("should fail to return index since Draw has expired", async () => {
      expect(
        DrawRingBufferLib._getIndex(
          {
            lastDrawId: 256,
            nextIndex: 1,
            cardinality: 256,
          },
          0
        )
      ).to.be.revertedWith("DRB/expired-draw");
    });
  });
});
