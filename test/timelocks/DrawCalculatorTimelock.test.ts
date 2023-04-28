import { increaseTime as increaseTimeHelper } from "./helpers/increaseTime";

import { TransactionResponse } from "@ethersproject/providers";

import { Contract, ContractFactory } from "ethers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { getSigners, provider } = ethers;
const { getBlock } = provider;

const increaseTime = (time: number) => increaseTimeHelper(provider, time);

describe("DrawCalculatorTimelock", () => {
  let wallet1: any;
  let wallet2: any;

  let drawCalculatorTimelock: Contract;

  let drawCalculatorTimelockFactory: ContractFactory;

  let initializeTx: TransactionResponse;

  beforeEach(async () => {
    [wallet1, wallet2] = await getSigners();

    drawCalculatorTimelockFactory = await ethers.getContractFactory("DrawCalculatorTimelockHarness");

    drawCalculatorTimelock = await upgrades.deployProxy(drawCalculatorTimelockFactory, [wallet1.address]);

    initializeTx = drawCalculatorTimelock.deployTransaction;
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(drawCalculatorTimelock.connect(wallet1).initialize(wallet1.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        drawCalculatorTimelock.connect(wallet1).testOnlyInitializingModifier(wallet1.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should emit Deployed event", async () => {
      await expect(initializeTx).to.emit(drawCalculatorTimelock, "Deployed");
    });
  });

  describe("setTimelock()", () => {
    it("should fail if not an owner is trying to set timelock", async () => {
      await expect(
        drawCalculatorTimelock.connect(wallet2).setTimelock({
          drawId: 1,
          timestamp: 100,
        })
      ).to.be.revertedWith("Ownable/caller-not-owner");
    });

    it("should allow the owner to force the timelock", async () => {
      const timestamp: number = 523;

      await drawCalculatorTimelock.connect(wallet1).setTimelock({
        drawId: 1,
        timestamp,
      });

      const timelock: any = await drawCalculatorTimelock.connect(wallet1).getTimelock();

      expect(timelock.drawId).to.equal(1);
      expect(timelock.timestamp).to.equal(timestamp);
    });
  });

  describe("lock()", () => {
    let timelock: { drawId: number; timestamp: number };

    beforeEach(async () => {
      timelock = {
        drawId: 1,
        timestamp: (await getBlock("latest")).timestamp,
      };

      await drawCalculatorTimelock.connect(wallet1).setTimelock(timelock);
    });

    it("should fail if timelock is not expired", async () => {
      await drawCalculatorTimelock.connect(wallet1).lock(2, (await getBlock("latest")).timestamp + 100);

      await expect(
        drawCalculatorTimelock.connect(wallet1).lock(3, (await getBlock("latest")).timestamp)
      ).to.be.revertedWith("OM/timelock-not-expired");
    });

    it("should lock next draw id and set the unlock timestamp", async () => {
      await increaseTime(61);

      // Locks Draw ID 2 and set the unlock timestamp to occur in 100 seconds.
      await expect(drawCalculatorTimelock.connect(wallet1).lock(2, (await getBlock("latest")).timestamp + 100)).to.emit(
        drawCalculatorTimelock,
        "LockedDraw"
      );

      const timelock: any = await drawCalculatorTimelock.connect(wallet1).getTimelock();
      const currentTimestamp: number = (await getBlock("latest")).timestamp;

      expect(timelock.drawId).to.equal(2);
      expect(timelock.timestamp).to.equal(currentTimestamp + 99);
    });

    it("should lock next draw id if manager", async () => {
      await drawCalculatorTimelock.connect(wallet1).setManager(wallet2.address);

      await increaseTime(61);

      await drawCalculatorTimelock.connect(wallet2).lock(2, (await getBlock("latest")).timestamp + 1);

      const timelock: any = await drawCalculatorTimelock.connect(wallet1).getTimelock();
      const currentTimestamp: number = (await getBlock("latest")).timestamp;

      expect(timelock.drawId).to.equal(2);
      expect(timelock.timestamp).to.equal(currentTimestamp);
    });

    it("should fail if not called by the owner or manager", async () => {
      await expect(
        drawCalculatorTimelock.connect(wallet2).lock(1, (await getBlock("latest")).timestamp)
      ).to.be.revertedWith("Manageable/caller-not-manager-or-owner");
    });

    it("should fail to lock if trying to lock current or previous draw id", async () => {
      await expect(
        drawCalculatorTimelock.connect(wallet1).lock(1, (await getBlock("latest")).timestamp)
      ).to.be.revertedWith("OM/not-drawid-plus-one");
    });
  });

  describe("hasElapsed()", () => {
    it("should return true if the timelock has not been set", async () => {
      expect(await drawCalculatorTimelock.connect(wallet1).hasElapsed()).to.equal(true);
    });

    it("should return true if the timelock has expired", async () => {
      await drawCalculatorTimelock.connect(wallet1).setTimelock({
        drawId: 1,
        timestamp: (await getBlock("latest")).timestamp,
      });

      await increaseTime(61);

      expect(await drawCalculatorTimelock.connect(wallet1).hasElapsed()).to.equal(true);
    });

    it("should return false if the timelock has not expired", async () => {
      await drawCalculatorTimelock.connect(wallet1).setTimelock({
        drawId: 1,
        timestamp: (await getBlock("latest")).timestamp + 100,
      });

      expect(await drawCalculatorTimelock.connect(wallet1).hasElapsed()).to.equal(false);
    });
  });
});
