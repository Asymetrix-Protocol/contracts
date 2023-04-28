import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { BigNumber, Contract, ContractFactory } from "ethers";

import { Signer } from "@ethersproject/abstract-signer";

import { ethers, artifacts, upgrades } from "hardhat";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const now = () => (new Date().getTime() / 1000) | 0;

describe("DrawBeacon", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let DrawBeaconFactory: ContractFactory;

  let drawBuffer: MockContract;

  let drawBeacon: Contract;

  let IERC20: Artifact;

  let beaconPeriodStart: number = now();

  const exampleBeaconPeriodSeconds: number = 1000;
  const nextDrawId: number = 1;

  const halfTime: number = exampleBeaconPeriodSeconds / 2;
  const overTime: number = exampleBeaconPeriodSeconds + 1;

  before(async () => {
    [wallet1, wallet2] = await ethers.getSigners();
  });

  beforeEach(async () => {
    IERC20 = await artifacts.readArtifact(
      "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol:IERC20Upgradeable"
    );

    const DrawBuffer: Artifact = await artifacts.readArtifact("DrawBuffer");

    drawBuffer = await deployMockContract(wallet1 as Signer, DrawBuffer.abi);

    DrawBeaconFactory = await ethers.getContractFactory("DrawBeaconHarness", wallet1);
    drawBeacon = await upgrades.deployProxy(DrawBeaconFactory, [
      wallet1.address,
      drawBuffer.address,
      nextDrawId,
      beaconPeriodStart,
      exampleBeaconPeriodSeconds,
    ]);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        drawBeacon
          .connect(wallet1)
          .initialize(wallet1.address, drawBuffer.address, nextDrawId, beaconPeriodStart, exampleBeaconPeriodSeconds)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        drawBeacon
          .connect(wallet1)
          .testOnlyInitializingModifier(
            wallet1.address,
            drawBuffer.address,
            nextDrawId,
            beaconPeriodStart,
            exampleBeaconPeriodSeconds
          )
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should emit a Deployed event", async () => {
      const drawBeacon: Contract = await upgrades.deployProxy(DrawBeaconFactory, [
        wallet1.address,
        drawBuffer.address,
        nextDrawId,
        beaconPeriodStart,
        exampleBeaconPeriodSeconds,
      ]);

      await expect(drawBeacon.deployTransaction)
        .to.emit(drawBeacon, "Deployed")
        .withArgs(nextDrawId, beaconPeriodStart);
      await expect(drawBeacon.deployTransaction).to.emit(drawBeacon, "BeaconPeriodStarted").withArgs(beaconPeriodStart);
    });

    it("should set the params", async () => {
      expect(await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt()).to.equal(beaconPeriodStart);
      expect(await drawBeacon.connect(wallet1).getBeaconPeriodSeconds()).to.equal(exampleBeaconPeriodSeconds);
    });

    it("should reject request period", async () => {
      const drawBeacon: Promise<Contract> = upgrades.deployProxy(DrawBeaconFactory, [
        wallet1.address,
        drawBuffer.address,
        nextDrawId,
        0,
        exampleBeaconPeriodSeconds,
      ]);

      await expect(drawBeacon).to.be.revertedWith("DrawBeacon/beacon-period-greater-than-zero");
    });

    it("should reject nextDrawId inferior to 1", async () => {
      const drawBeacon: Promise<Contract> = upgrades.deployProxy(DrawBeaconFactory, [
        wallet1.address,
        drawBuffer.address,
        0,
        beaconPeriodStart,
        exampleBeaconPeriodSeconds,
      ]);

      await expect(drawBeacon).to.be.revertedWith("DrawBeacon/next-draw-id-gte-one");
    });
  });

  describe("Core Functions", () => {
    describe("canStartDraw()", () => {
      it("should determine if a prize is able to be awarded", async () => {
        const startTime: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt();

        // Prize-period not over
        await drawBeacon.connect(wallet1).setCurrentTime(startTime.add(10));

        expect(await drawBeacon.connect(wallet1).canStartDraw()).to.equal(false);

        // Prize-period not over
        await drawBeacon.connect(wallet1).setCurrentTime(startTime.add(10));

        expect(await drawBeacon.connect(wallet1).canStartDraw()).to.equal(false);

        // Prize-period over
        await drawBeacon.connect(wallet1).setCurrentTime(startTime.add(exampleBeaconPeriodSeconds));

        expect(await drawBeacon.connect(wallet1).canStartDraw()).to.equal(true);
      });
    });

    describe("with a prize-period scheduled in the future", () => {
      let drawBeaconBase2: Contract;

      beforeEach(async () => {
        beaconPeriodStart = 10000;
        drawBeaconBase2 = await upgrades.deployProxy(DrawBeaconFactory, [
          wallet1.address,
          drawBuffer.address,
          nextDrawId,
          beaconPeriodStart,
          exampleBeaconPeriodSeconds,
        ]);
      });

      describe("startDraw()", () => {
        it("should prevent starting an award", async () => {
          await drawBeaconBase2.connect(wallet1).setCurrentTime(100);

          await expect(drawBeaconBase2.connect(wallet1).startDraw()).to.be.revertedWith(
            "DrawBeacon/beacon-period-not-over"
          );
        });

        it("should not be called twice", async () => {
          await drawBeaconBase2.connect(wallet1).setCurrentTime(1000000);

          const beaconPeriodStartedAt: BigNumber = await drawBeaconBase2.connect(wallet1).getBeaconPeriodStartedAt();
          const beaconPeriodSeconds: BigNumber = await drawBeaconBase2.connect(wallet1).getBeaconPeriodSeconds();

          await drawBuffer.mock.pushDraw
            .withArgs([1, 1000000, beaconPeriodStartedAt, beaconPeriodSeconds, 0, "0x", [], 0, false, false])
            .returns(1);

          await drawBeaconBase2.connect(wallet1).startDraw();

          expect(await drawBeaconBase2.connect(wallet1).canStartDraw()).to.equal(false);
        });

        describe("starts draw", () => {
          beforeEach(async () => {
            // Ensure prize period is over
            await drawBeacon.connect(wallet1).setCurrentTime(await drawBeacon.connect(wallet1).beaconPeriodEndAt());
          });

          it("should emit the events", async () => {
            await drawBeacon
              .connect(wallet1)
              .setCurrentTime((await drawBeacon.connect(wallet1).beaconPeriodEndAt()).add(1000));

            const beaconPeriodStartedAt: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt();
            const beaconPeriodSeconds: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodSeconds();
            const currentTime: BigNumber = await drawBeacon.connect(wallet1).currentTime();

            await drawBuffer.mock.pushDraw
              .withArgs([1, currentTime, beaconPeriodStartedAt, beaconPeriodSeconds, 0, "0x", [], 0, false, false])
              .returns(1);

            const nextStartTime: BigNumber = await drawBeacon
              .connect(wallet1)
              .calculateNextBeaconPeriodStartTimeFromCurrentTime();

            expect(await drawBeacon.connect(wallet1).startDraw())
              .to.emit(drawBeacon, "DrawStarted")
              .withArgs(1)
              .and.to.emit(drawBeacon, "BeaconPeriodStarted")
              .withArgs(nextStartTime);

            expect(await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt()).to.equal(nextStartTime);
          });
        });
      });
    });
  });

  describe("Setter Functions", () => {
    describe("setDrawBuffer()", () => {
      it("should allow the owner to set the draw buffer", async () => {
        await expect(drawBeacon.connect(wallet1).setDrawBuffer(wallet2.address))
          .to.emit(drawBeacon, "DrawBufferUpdated")
          .withArgs(wallet2.address);

        expect(await drawBeacon.connect(wallet1).getDrawBuffer()).to.equal(wallet2.address);
      });

      it("should not allow non-owners to set the draw buffer", async () => {
        await expect(drawBeacon.connect(wallet2).setDrawBuffer(wallet2.address)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });

      it("should not allow setting a zero draw buffer", async () => {
        await expect(drawBeacon.connect(wallet1).setDrawBuffer(ethers.constants.AddressZero)).to.be.revertedWith(
          "DrawBeacon/draw-history-not-zero-address"
        );
      });

      it("should be a different draw buffer", async () => {
        await expect(drawBeacon.connect(wallet1).setDrawBuffer(drawBuffer.address)).to.be.revertedWith(
          "DrawBeacon/existing-draw-history-address"
        );
      });
    });

    describe("setBeaconPeriodSeconds()", () => {
      it("should allow the owner to set the beacon period", async () => {
        await expect(drawBeacon.connect(wallet1).setBeaconPeriodSeconds(99))
          .to.emit(drawBeacon, "BeaconPeriodSecondsUpdated")
          .withArgs(99);

        expect(await drawBeacon.connect(wallet1).getBeaconPeriodSeconds()).to.equal(99);
      });

      it("should not allow non-owners to set the prize period", async () => {
        await expect(drawBeacon.connect(wallet2).setBeaconPeriodSeconds(99)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });

      it("should not allow a zero period", async () => {
        await expect(drawBeacon.connect(wallet1).setBeaconPeriodSeconds(0)).to.be.revertedWith(
          "DrawBeacon/beacon-period-greater-than-zero"
        );
      });
    });
  });

  describe("Getter Functions", () => {
    describe("getNextDrawId()", () => {
      it("should return the next draw id", async () => {
        expect(await drawBeacon.connect(wallet1).getNextDrawId()).to.equal(nextDrawId);
      });
    });
    describe("beaconPeriodRemainingSeconds()", () => {
      it("should calculate the remaining seconds of the prize period", async () => {
        const startTime: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt();

        // Half-time
        await drawBeacon.connect(wallet1).setCurrentTime(startTime.add(halfTime));

        expect(await drawBeacon.connect(wallet1).beaconPeriodRemainingSeconds()).to.equal(halfTime);

        // Over-time
        await drawBeacon.connect(wallet1).setCurrentTime(startTime.add(overTime));

        expect(await drawBeacon.connect(wallet1).beaconPeriodRemainingSeconds()).to.equal(0);
      });
    });

    describe("calculateNextBeaconPeriodStartTime()", () => {
      it("should always sync to the last period start time", async () => {
        let startedAt: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt();

        expect(
          await drawBeacon
            .connect(wallet1)
            .calculateNextBeaconPeriodStartTime(startedAt.add(exampleBeaconPeriodSeconds * 14))
        ).to.equal(startedAt.add(exampleBeaconPeriodSeconds * 14));
      });

      it("should return the current if it is within", async () => {
        let startedAt: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt();

        expect(
          await drawBeacon
            .connect(wallet1)
            .calculateNextBeaconPeriodStartTime(startedAt.add(exampleBeaconPeriodSeconds / 2))
        ).to.equal(startedAt);
      });

      it("should return the next if it is after", async () => {
        let startedAt: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt();

        expect(
          await drawBeacon
            .connect(wallet1)
            .calculateNextBeaconPeriodStartTime(startedAt.add(parseInt("" + exampleBeaconPeriodSeconds * 1.5)))
        ).to.equal(startedAt.add(exampleBeaconPeriodSeconds));
      });
    });

    it("should get the getBeaconPeriodSeconds", async () => {
      expect(await drawBeacon.connect(wallet1).getBeaconPeriodSeconds()).to.equal(1000);
    });

    it("should get the beaconPeriodEndAt", async () => {
      expect(await drawBeacon.connect(wallet1).beaconPeriodEndAt()).to.equal(
        await drawBeacon.connect(wallet1).beaconPeriodEndAt()
      );
    });

    it("should get the getBeaconPeriodSeconds", async () => {
      expect(await drawBeacon.connect(wallet1).getBeaconPeriodSeconds()).to.equal(1000);
    });

    it("should get the getBeaconPeriodStartedAt", async () => {
      expect(await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt()).to.equal(
        await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt()
      );
    });

    it("should get the getDrawBuffer", async () => {
      expect(await drawBeacon.connect(wallet1).getDrawBuffer()).to.equal(drawBuffer.address);
    });

    it("should return current block.timestamp", async () => {
      const timestamp: number = (await ethers.provider.getBlock("latest")).timestamp;

      expect(await drawBeacon.connect(wallet1)._currentTimeInternal()).to.equal(timestamp);
    });

    describe("isBeaconPeriodOver()", () => {
      it("should determine if the prize-period is over", async () => {
        const startTime: BigNumber = await drawBeacon.connect(wallet1).getBeaconPeriodStartedAt();

        // Half-time
        await drawBeacon.connect(wallet1).setCurrentTime(startTime.add(halfTime));

        expect(await drawBeacon.connect(wallet1).isBeaconPeriodOver()).to.equal(false);

        // Over-time
        await drawBeacon.connect(wallet1).setCurrentTime(startTime.add(overTime));

        expect(await drawBeacon.connect(wallet1).isBeaconPeriodOver()).to.equal(true);
      });
    });
  });

  describe("Internal Functions", () => {
    it("should return the internally set block.timestamp", async () => {
      await drawBeacon.connect(wallet1).setCurrentTime(100);

      expect(await drawBeacon.connect(wallet1).currentTime()).to.equal(100);
    });

    it("should return current block.timestamp", async () => {
      const timestamp: number = (await ethers.provider.getBlock("latest")).timestamp;

      expect(await drawBeacon.connect(wallet1)._currentTimeInternal()).to.equal(timestamp);
    });
  });
});
