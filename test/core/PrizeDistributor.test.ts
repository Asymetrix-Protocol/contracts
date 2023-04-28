import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";

import { utils, constants, Contract, ContractFactory, BigNumber } from "ethers";

import { increaseTime as increaseTimeHelper } from "./helpers/increaseTime";

import { getPreviousBlockTimestamp } from "./helpers/getBlockTimestamp";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import hre, { artifacts, ethers, upgrades } from "hardhat";

import { Draw, RngRequest } from "./types";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const { getSigners, provider } = ethers;
const { parseEther: toWei } = utils;
const { AddressZero } = constants;

const increaseTime = (time: number) => increaseTimeHelper(provider, time);

describe("PrizeDistributor", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;

  let prizeDistributionBuferFactory: ContractFactory;
  let prizeDistributorFactory: ContractFactory;
  let drawBufferFactory: ContractFactory;

  let RNGServiceChainlinkV2: Artifact;

  let rngServiceChainlinkV2: MockContract;

  let prizeDistributionBuffer: Contract;
  let prizeDistributor: Contract;
  let drawBuffer: Contract;
  let ticket: Contract;
  let dai: Contract;

  const distribution: BigNumber[] = [BigNumber.from(10000)];

  const rngTimeout: BigNumber = BigNumber.from("7200"); // 2 hours (in seconds)

  const participantsHash: string = "QmXZ6ogD4okn5w386r4a2Lo8pj6uGCv2we4qoDR2Esztk1";

  before(async () => {
    [wallet1, wallet2, wallet3] = await getSigners();
  });

  beforeEach(async () => {
    await hre.network.provider.send("hardhat_reset");

    const erc20MintableFactory: ContractFactory = await ethers.getContractFactory(
      "contracts/core/test/ERC20Mintable.sol:ERC20Mintable"
    );

    dai = await upgrades.deployProxy(erc20MintableFactory, ["Dai Stablecoin", "DAI"]);

    ticket = await upgrades.deployProxy(erc20MintableFactory, ["Ticket", "TICK"]);

    drawBufferFactory = await ethers.getContractFactory("DrawBuffer");
    drawBuffer = await upgrades.deployProxy(drawBufferFactory, [wallet1.address, BigNumber.from(255)]);

    prizeDistributionBuferFactory = await ethers.getContractFactory("PrizeDistributionBuffer");
    prizeDistributionBuffer = await upgrades.deployProxy(prizeDistributionBuferFactory, [
      wallet1.address,
      BigNumber.from(5),
    ]);

    RNGServiceChainlinkV2 = await artifacts.readArtifact("RNGServiceChainlinkV2");
    rngServiceChainlinkV2 = await deployMockContract(wallet1, RNGServiceChainlinkV2.abi);

    prizeDistributorFactory = await ethers.getContractFactory("PrizeDistributorHarness");
    prizeDistributor = await upgrades.deployProxy(prizeDistributorFactory, [
      wallet1.address,
      ticket.address,
      drawBuffer.address,
      prizeDistributionBuffer.address,
      rngServiceChainlinkV2.address,
      distribution,
      rngTimeout,
    ]);

    await prizeDistributor.setManager(wallet2.address);
  });

  /* ==================================== */
  /* ======== Initializer Tests ========= */
  /* ==================================== */
  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        prizeDistributor
          .connect(wallet1)
          .initialize(
            wallet1.address,
            ticket.address,
            drawBuffer.address,
            prizeDistributionBuffer.address,
            rngServiceChainlinkV2.address,
            distribution,
            rngTimeout
          )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        prizeDistributor.connect(wallet1)["testOnlyInitializingModifier(address)"](wallet1.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        prizeDistributor
          .connect(wallet1)
          ["testOnlyInitializingModifier(address,address,address,address,uint16[],uint32)"](
            ticket.address,
            drawBuffer.address,
            prizeDistributionBuffer.address,
            rngServiceChainlinkV2.address,
            distribution,
            rngTimeout
          )
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if token is zero address", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributorFactory, [
          wallet1.address,
          AddressZero,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          rngServiceChainlinkV2.address,
          distribution,
          rngTimeout,
        ])
      ).to.be.revertedWith("PrizeDistributor/token-not-zero-address");
    });

    it("should fail if DrawBuffer is zero address", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributorFactory, [
          wallet1.address,
          ticket.address,
          AddressZero,
          prizeDistributionBuffer.address,
          rngServiceChainlinkV2.address,
          distribution,
          rngTimeout,
        ])
      ).to.be.revertedWith("PrizeDistributor/draw-buffer-not-zero-address");
    });

    it("should fail if PrizeDistributionBuffer is zero address", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributorFactory, [
          wallet1.address,
          ticket.address,
          drawBuffer.address,
          AddressZero,
          rngServiceChainlinkV2.address,
          distribution,
          rngTimeout,
        ])
      ).to.be.revertedWith("PrizeDistributor/prize-distribution-buffer-not-zero-address");
    });

    it("should fail if RGNServiceChainlinkV2 is zero address", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributorFactory, [
          wallet1.address,
          ticket.address,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          AddressZero,
          distribution,
          rngTimeout,
        ])
      ).to.be.revertedWith("PrizeDistributor/rng-service-not-zero-address");
    });

    it("should fail if total distribution is not equal to 100%", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributorFactory, [
          wallet1.address,
          ticket.address,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          rngServiceChainlinkV2.address,
          [BigNumber.from(5000), BigNumber.from(3000), BigNumber.from(1999)],
          rngTimeout,
        ])
      ).to.be.revertedWith("PrizeDistributor/distribution-should-be-equal-to-100%");
    });

    it("should fail if RNG timeout is lte 60", async () => {
      await expect(
        upgrades.deployProxy(prizeDistributorFactory, [
          wallet1.address,
          ticket.address,
          drawBuffer.address,
          prizeDistributionBuffer.address,
          rngServiceChainlinkV2.address,
          distribution,
          BigNumber.from(60),
        ])
      ).to.be.revertedWith("PrizeDistributor/rng-timeout-gt-60-seconds");
    });

    it("should properly set initial storage values", async () => {
      const deployed: Contract = await upgrades.deployProxy(prizeDistributorFactory, [
        wallet1.address,
        ticket.address,
        drawBuffer.address,
        prizeDistributionBuffer.address,
        rngServiceChainlinkV2.address,
        distribution,
        rngTimeout,
      ]);
      const tx: TransactionResponse = deployed.deployTransaction;

      expect(tx)
        .to.emit(deployed, "TokenSet")
        .withArgs(ticket.address)
        .to.emit(deployed, "DrawBufferSet")
        .withArgs(drawBuffer.address)
        .to.emit(deployed, "PrizeDistributionBufferSet")
        .withArgs(prizeDistributionBuffer.address)
        .to.emit(deployed, "RngServiceSet")
        .withArgs(rngServiceChainlinkV2.address)
        .to.emit(deployed, "DistributionSet")
        .withArgs(distribution)
        .to.emit(deployed, "RngTimeoutSet")
        .withArgs(rngTimeout);

      expect(await deployed.connect(wallet1).getToken()).to.equal(ticket.address);
      expect(await deployed.connect(wallet1).getDrawBuffer()).to.equal(drawBuffer.address);
      expect(await deployed.connect(wallet1).getPrizeDistributionBuffer()).to.equal(prizeDistributionBuffer.address);
      expect(await deployed.connect(wallet1).getRngService()).to.equal(rngServiceChainlinkV2.address);
      expect(await deployed.connect(wallet1).getDistribution()).to.deep.equal(distribution);
      expect(await deployed.connect(wallet1).getRngTimeout()).to.deep.equal(rngTimeout);
      expect(await deployed.connect(wallet1).getLastUnpaidDrawId()).to.equal(BigNumber.from(1));
    });
  });

  /* =============================== */
  /* ======== Getter Tests ========= */
  /* =============================== */
  describe("Getter Functions", () => {
    const drawId: BigNumber = BigNumber.from(1);

    beforeEach(async () => {
      await drawBuffer.connect(wallet1).setPrizeDistributor(prizeDistributor.address);
      await drawBuffer.connect(wallet1).pushDraw({
        drawId,
        timestamp: BigNumber.from(Math.round(+new Date() / 1000)),
        beaconPeriodStartedAt: BigNumber.from(Math.round(+new Date() / 1000)),
        beaconPeriodSeconds: BigNumber.from(10),
        rngRequestInternalId: BigNumber.from(0),
        participantsHash: "0x",
        randomness: [],
        picksNumber: BigNumber.from(0),
        isEmpty: false,
        paid: false,
      });
    });

    describe("getToken()", () => {
      it("should successfully read global token variable", async () => {
        expect(await prizeDistributor.connect(wallet1).getToken()).to.equal(ticket.address);
      });
    });

    describe("getDrawBuffer()", () => {
      it("should successfully read global drawBuffer variable", async () => {
        expect(await prizeDistributor.connect(wallet1).getDrawBuffer()).to.equal(drawBuffer.address);
      });
    });

    describe("getPrizeDistributionBuffer()", () => {
      it("should successfully read global prizeDistributinBuffer variable", async () => {
        expect(await prizeDistributor.connect(wallet1).getPrizeDistributionBuffer()).to.equal(
          prizeDistributionBuffer.address
        );
      });
    });

    describe("getRngService()", () => {
      it("should successfully read global rngService variable", async () => {
        expect(await prizeDistributor.connect(wallet1).getRngService()).to.equal(rngServiceChainlinkV2.address);
      });
    });

    describe("getDistribution()", () => {
      it("should successfully read global distribution variable", async () => {
        expect(await prizeDistributor.connect(wallet1).getDistribution()).to.deep.equal(distribution);
      });
    });

    describe("getRngTimeout()", () => {
      it("should successfully read global rngTimeout variable", async () => {
        expect(await prizeDistributor.connect(wallet1).getRngTimeout()).to.equal(rngTimeout);
      });
    });

    describe("getLastRngRequest()", () => {
      it("should successfully read global rngRequest variable", async () => {
        const lastRngRequest: RngRequest = await prizeDistributor.connect(wallet1).getLastRngRequest();

        expect(lastRngRequest.id).to.equal(BigNumber.from(0));
        expect(lastRngRequest.lockBlock).to.equal(BigNumber.from(0));
        expect(lastRngRequest.requestedAt).to.equal(BigNumber.from(0));
      });
    });

    describe("getNumberOfWinners()", () => {
      it("should successfully read number of winners", async () => {
        expect(await prizeDistributor.connect(wallet1).getNumberOfWinners()).to.equal(
          BigNumber.from(distribution.length)
        );
      });
    });

    describe("getLastUnpaidDrawId()", () => {
      it("should successfully read lastUnpdaidDrawId variable", async () => {
        expect(await prizeDistributor.connect(wallet1).getLastUnpaidDrawId()).to.equal(BigNumber.from(1));
      });
    });

    describe("isRngRequested()", () => {
      it("should return `false`", async () => {
        expect(await prizeDistributor.connect(wallet1).isRngRequested()).to.be.false;
      });

      it("should return `true`", async () => {
        await increaseTime(500);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(BigNumber.from(1), BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);

        expect(await prizeDistributor.connect(wallet1).isRngRequested()).to.be.true;
      });
    });

    describe("isRngCompleted()", () => {
      beforeEach(async () => {
        await increaseTime(500);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(BigNumber.from(1), BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);
      });

      it("should return `false`", async () => {
        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(BigNumber.from(1)).returns(false);

        expect(await prizeDistributor.connect(wallet1).isRngCompleted()).to.be.false;
      });

      it("should return `true`", async () => {
        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(BigNumber.from(1)).returns(true);

        expect(await prizeDistributor.connect(wallet1).isRngCompleted()).to.be.true;
      });
    });

    describe("isRngTimedOut()", () => {
      it("should return `false`", async () => {
        expect(await prizeDistributor.connect(wallet1).isRngTimedOut()).to.be.false;
      });

      it("should return `false` firstly and then `true`", async () => {
        await increaseTime(500);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(BigNumber.from(1), BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);

        await increaseTime(1);

        expect(await prizeDistributor.connect(wallet1).isRngTimedOut()).to.be.false;

        await increaseTime(rngTimeout.toNumber());

        expect(await prizeDistributor.connect(wallet1).isRngTimedOut()).to.be.true;
      });
    });
  });

  /* ====================================== */
  /* ======== Core External Tests ========= */
  /* ====================================== */
  describe("Core External Functions", () => {
    describe("payWinners()", () => {
      const drawId: BigNumber = BigNumber.from(1);
      const distribution: BigNumber[] = [BigNumber.from(5000), BigNumber.from(3000), BigNumber.from(2000)];

      beforeEach(async () => {
        await drawBuffer.connect(wallet1).setPrizeDistributor(prizeDistributor.address);
        await drawBuffer.connect(wallet1).pushDraw({
          drawId,
          timestamp: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodStartedAt: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodSeconds: BigNumber.from(10),
          rngRequestInternalId: BigNumber.from(0),
          participantsHash: "0x",
          randomness: [],
          picksNumber: BigNumber.from(0),
          isEmpty: false,
          paid: false,
        });

        await prizeDistributor.connect(wallet1).setDistribution(distribution);
      });

      it("should fail if not a manager or not an owner is trying to pay winners", async () => {
        await expect(prizeDistributor.connect(wallet3).payWinners(drawId, [])).to.be.revertedWith(
          "Manageable/caller-not-manager-or-owner"
        );
      });

      it("should fail if draw ID is not equal to the last unpaid draw ID", async () => {
        await expect(prizeDistributor.connect(wallet2).payWinners(BigNumber.from(0), [])).to.be.revertedWith(
          "PrizeDistributor/draw-id-should-be-the-same-as-last-unpaid-draw-id"
        );
      });

      it("should fail if a draw is not finished yet", async () => {
        await expect(prizeDistributor.connect(wallet2).payWinners(drawId, [])).to.be.revertedWith(
          "PrizeDistributor/draw-is-not-finished-yet"
        );
      });

      it("should fail if a draw is already paid", async () => {
        await drawBuffer.connect(wallet1).setPrizeDistributor(wallet1.address);
        await drawBuffer.connect(wallet1).markDrawAsPaid(drawId);

        await increaseTime(500);

        await expect(prizeDistributor.connect(wallet2).payWinners(drawId, [])).to.be.revertedWith(
          "PrizeDistributor/draw-is-already-paid"
        );
      });

      it("should fail if winners array length is not equal to the distribution array length", async () => {
        await increaseTime(500);

        await expect(prizeDistributor.connect(wallet2).payWinners(drawId, [wallet1.address])).to.be.revertedWith(
          "PrizeDistributor/lengths-mismatch"
        );
        await expect(
          prizeDistributor.connect(wallet2).payWinners(drawId, [wallet1.address, wallet2.address])
        ).to.be.revertedWith("PrizeDistributor/lengths-mismatch");
        await expect(
          prizeDistributor
            .connect(wallet2)
            .payWinners(drawId, [wallet1.address, wallet2.address, wallet3.address, wallet1.address])
        ).to.be.revertedWith("PrizeDistributor/lengths-mismatch");
      });

      it("should fail if prizes amount is zero", async () => {
        await increaseTime(500);

        await expect(
          prizeDistributor.connect(wallet2).payWinners(drawId, [wallet1.address, wallet2.address, wallet3.address])
        ).to.be.revertedWith("PrizeDistributor/prizes-amount-is-zero");
      });

      it("should fail if at least one winner is zero address", async () => {
        await increaseTime(500);

        await ticket.connect(wallet1).mint(prizeDistributor.address, BigNumber.from(1));

        await expect(
          prizeDistributor.connect(wallet2).payWinners(drawId, [AddressZero, wallet2.address, wallet3.address])
        ).to.be.revertedWith("PrizeDistributor/winner-is-zero-address");
        await expect(
          prizeDistributor.connect(wallet2).payWinners(drawId, [wallet1.address, AddressZero, wallet3.address])
        ).to.be.revertedWith("PrizeDistributor/winner-is-zero-address");
        await expect(
          prizeDistributor.connect(wallet2).payWinners(drawId, [wallet1.address, wallet2.address, AddressZero])
        ).to.be.revertedWith("PrizeDistributor/winner-is-zero-address");
      });

      it("should mark a draw as paid in the DrawBuffer", async () => {
        await increaseTime(500);

        await ticket.connect(wallet1).mint(prizeDistributor.address, BigNumber.from(100));

        await prizeDistributor.connect(wallet2).payWinners(drawId, [wallet1.address, wallet2.address, wallet3.address]);

        expect((await drawBuffer.connect(wallet1).getDraw(drawId)).paid).to.be.equal(true);
      });

      it("should increment lastUnpaidDrawId", async () => {
        await increaseTime(500);

        await ticket.connect(wallet1).mint(prizeDistributor.address, BigNumber.from(100));

        const prevLastUnpaidDrawId: number = await prizeDistributor.connect(wallet1).getLastUnpaidDrawId();

        await prizeDistributor.connect(wallet2).payWinners(drawId, [wallet1.address, wallet2.address, wallet3.address]);

        expect(await prizeDistributor.connect(wallet1).getLastUnpaidDrawId()).to.be.equal(prevLastUnpaidDrawId + 1);
      });

      it("should properly pay winners", async () => {
        await increaseTime(500);

        const totalPayout: BigNumber = BigNumber.from(100);
        const winners: string[] = [wallet1.address, wallet2.address, wallet3.address];
        const randomness: BigNumber[] = [];
        const payouts: BigNumber[] = distribution.map((value: BigNumber) =>
          totalPayout.mul(value).div(BigNumber.from(10000))
        );

        await ticket.connect(wallet1).mint(prizeDistributor.address, totalPayout);

        await expect(prizeDistributor.connect(wallet2).payWinners(drawId, winners))
          .to.emit(prizeDistributor, "DrawPaid")
          .withArgs(
            drawId,
            totalPayout,
            winners,
            randomness,
            payouts,
            (await getPreviousBlockTimestamp()).add(BigNumber.from(1))
          );

        for (let i: number = 0; i < winners.length; ++i) {
          expect(await ticket.connect(wallet1).balanceOf(winners[i])).to.be.equal(payouts[i]);
        }

        expect(await ticket.connect(wallet1).balanceOf(prizeDistributor.address)).to.be.equal(BigNumber.from(0));
      });

      it("should pay to one winner multiple times", async () => {
        await increaseTime(500);

        const totalPayout: BigNumber = BigNumber.from(100);
        const winners: string[] = [wallet1.address, wallet1.address, wallet1.address];
        const randomness: BigNumber[] = [];
        const payouts: BigNumber[] = distribution.map((value: BigNumber) =>
          totalPayout.mul(value).div(BigNumber.from(10000))
        );

        await ticket.connect(wallet1).mint(prizeDistributor.address, totalPayout);

        await expect(prizeDistributor.connect(wallet2).payWinners(drawId, winners))
          .to.emit(prizeDistributor, "DrawPaid")
          .withArgs(
            drawId,
            totalPayout,
            winners,
            randomness,
            payouts,
            (await getPreviousBlockTimestamp()).add(BigNumber.from(1))
          );

        expect(await ticket.connect(wallet1).balanceOf(winners[0])).to.be.equal(totalPayout);
        expect(await ticket.connect(wallet1).balanceOf(prizeDistributor.address)).to.be.equal(BigNumber.from(0));
      });

      it("should not pay if winners array length is equal to 0", async () => {
        await increaseTime(500);

        await ticket.connect(wallet1).mint(prizeDistributor.address, BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .payWinners(BigNumber.from(1), [wallet1.address, wallet2.address, wallet3.address]);

        const drawId: BigNumber = BigNumber.from(2);

        await drawBuffer.connect(wallet1).pushDraw({
          drawId,
          timestamp: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodStartedAt: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodSeconds: BigNumber.from(10),
          rngRequestInternalId: BigNumber.from(0),
          participantsHash: "0x",
          randomness: [],
          picksNumber: BigNumber.from(0),
          isEmpty: true,
          paid: false,
        });

        await increaseTime(500);

        const totalPayout: BigNumber = BigNumber.from(100);
        const winners: string[] = [];
        const randomness: BigNumber[] = [];
        const payouts: BigNumber[] = [];

        await ticket.connect(wallet1).mint(prizeDistributor.address, totalPayout);

        await expect(prizeDistributor.connect(wallet2).payWinners(drawId, winners))
          .to.emit(prizeDistributor, "DrawPaid")
          .withArgs(
            drawId,
            BigNumber.from(0),
            winners,
            randomness,
            payouts,
            (await getPreviousBlockTimestamp()).add(BigNumber.from(1))
          );

        expect(await ticket.connect(wallet1).balanceOf(prizeDistributor.address)).to.be.equal(totalPayout);
        expect((await drawBuffer.connect(wallet1).getDraw(drawId)).paid).to.be.equal(true);
      });

      xit("should pay 3341 winners with the max gas limit", async () => {
        // Gas: 29.525.287,  Winners: 3341

        await increaseTime(500);

        const maxGasLimit: number = 30000000;
        const amountOfWinners: number = 3341;
        const totalPayout: BigNumber = toWei("1000");
        const winners: string[] = new Array(amountOfWinners).fill(wallet1.address);
        const randomness: BigNumber[] = [];
        const distribution: string[] = [
          ...new Array(3340).fill(BigNumber.from(2)),
          ...new Array(1).fill(BigNumber.from(3320)),
        ];
        const payouts: BigNumber[] = distribution.map((value: string) =>
          totalPayout.mul(value).div(BigNumber.from(10000))
        );

        await prizeDistributor.connect(wallet1).setDistribution(distribution);
        await ticket.connect(wallet1).mint(prizeDistributor.address, totalPayout);

        const txResponse: TransactionResponse = await prizeDistributor
          .connect(wallet2)
          .payWinners(drawId, winners, { gasLimit: maxGasLimit });
        const txReceipt: TransactionReceipt = await txResponse.wait();

        const isGasLowerThanMaxGas = BigNumber.from(txReceipt.gasUsed).lte(maxGasLimit);

        expect(txResponse)
          .to.emit(prizeDistributor, "DrawPaid")
          .withArgs(drawId, totalPayout, winners, randomness, payouts, await getPreviousBlockTimestamp());
        expect(isGasLowerThanMaxGas).to.equal(true);
      });
    });

    describe("requestRandomness()", () => {
      const drawId: BigNumber = BigNumber.from(1);

      beforeEach(async () => {
        await drawBuffer.connect(wallet1).setPrizeDistributor(prizeDistributor.address);
        await drawBuffer.connect(wallet1).pushDraw({
          drawId,
          timestamp: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodStartedAt: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodSeconds: BigNumber.from(10),
          rngRequestInternalId: BigNumber.from(0),
          participantsHash: "0x",
          randomness: [],
          picksNumber: BigNumber.from(0),
          isEmpty: false,
          paid: false,
        });
      });

      it("should fail if not manager is trying to request randomness", async () => {
        await expect(
          prizeDistributor.connect(wallet1).requestRandomness(drawId, BigNumber.from(0), "0x", false)
        ).to.be.revertedWith("Manageable/caller-not-manager");
      });

      it("should fail if manager is trying to request randomness for the future draw", async () => {
        await expect(
          prizeDistributor.connect(wallet2).requestRandomness(drawId.add(1), BigNumber.from(0), "0x", false)
        ).to.be.revertedWith("DRB/future-draw");
      });

      it("should fail if draw ID is not equal to the last unpaid draw ID", async () => {
        await expect(
          prizeDistributor.connect(wallet2).requestRandomness(drawId.sub(1), BigNumber.from(0), "0x", false)
        ).to.be.revertedWith("PrizeDistributor/draw-id-should-be-the-same-as-last-unpaid-draw-id");
      });

      it("should fail if a draw is not finished yet", async () => {
        await expect(
          prizeDistributor.connect(wallet2).requestRandomness(drawId, BigNumber.from(0), "0x", false)
        ).to.be.revertedWith("PrizeDistributor/draw-is-not-finished-yet");
      });

      it("should fail if a draw is already paid", async () => {
        await drawBuffer.connect(wallet1).setPrizeDistributor(wallet1.address);
        await drawBuffer.connect(wallet1).markDrawAsPaid(drawId);

        await increaseTime(500);

        await expect(
          prizeDistributor.connect(wallet2).requestRandomness(drawId, BigNumber.from(0), "0x", false)
        ).to.be.revertedWith("PrizeDistributor/draw-is-already-paid");
      });

      it("should fail if participants hash is equal to zero", async () => {
        await increaseTime(500);

        await expect(
          prizeDistributor.connect(wallet2).requestRandomness(drawId, BigNumber.from(0), "0x", false)
        ).to.be.revertedWith("PrizeDistributor/participants-hash-can-not-have-zero-length");
      });

      it("should fail if randomness already requested by the manager", async () => {
        await increaseTime(500);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(BigNumber.from(1), BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);

        await expect(
          prizeDistributor
            .connect(wallet2)
            .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false)
        ).to.be.revertedWith("PrizeDistributor/randomness-already-requested");
      });

      it("should request randomness properly", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);
        const lockBlock: BigNumber = BigNumber.from(100);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, lockBlock);

        await expect(
          prizeDistributor
            .connect(wallet2)
            .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false)
        )
          .to.emit(prizeDistributor, "RandomnessRequested")
          .withArgs(drawId, requestId, lockBlock, distribution.length);

        const lastRngRequest: RngRequest = await prizeDistributor.connect(wallet1).getLastRngRequest();

        expect(lastRngRequest.id).to.equal(requestId);
        expect(lastRngRequest.lockBlock).to.equal(lockBlock);
        expect(lastRngRequest.requestedAt).to.equal(await getPreviousBlockTimestamp());

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(requestId).returns(false);

        expect(await prizeDistributor.connect(wallet1).isRngRequested()).to.be.true;
        expect(await prizeDistributor.connect(wallet1).isRngCompleted()).to.be.false;
        expect(await prizeDistributor.connect(wallet1).isRngTimedOut()).to.be.false;
      });

      it("should update draw info properly", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        const picksNumber: BigNumber = BigNumber.from(100);

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, picksNumber, Buffer.from(participantsHash), false);

        const draw: Draw = await drawBuffer.connect(wallet1).getDraw(drawId);

        expect(draw.rngRequestInternalId).to.be.equal(requestId);
        expect(draw.picksNumber).to.be.equal(picksNumber);
        expect(draw.participantsHash).to.be.equal("0x" + Buffer.from(participantsHash).toString("hex"));
      });

      it("should not make an RNG request if draw is empty (without participants)", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), true);

        const lastRngRequest: RngRequest = await prizeDistributor.connect(wallet1).getLastRngRequest();

        expect(lastRngRequest.id).to.equal(BigNumber.from(0));
        expect(lastRngRequest.lockBlock).to.equal(BigNumber.from(0));
        expect(lastRngRequest.requestedAt).to.equal(BigNumber.from(0));

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(BigNumber.from(0)).returns(false);

        expect(await prizeDistributor.connect(wallet1).isRngRequested()).to.be.false;
        expect(await prizeDistributor.connect(wallet1).isRngCompleted()).to.be.false;
        expect(await prizeDistributor.connect(wallet1).isRngTimedOut()).to.be.false;
      });
    });

    describe("processRandomness()", () => {
      const drawId: BigNumber = BigNumber.from(1);

      beforeEach(async () => {
        await drawBuffer.connect(wallet1).setPrizeDistributor(prizeDistributor.address);
        await drawBuffer.connect(wallet1).pushDraw({
          drawId,
          timestamp: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodStartedAt: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodSeconds: BigNumber.from(10),
          rngRequestInternalId: BigNumber.from(0),
          participantsHash: "0x",
          randomness: [],
          picksNumber: BigNumber.from(0),
          isEmpty: false,
          paid: false,
        });
      });

      it("should fail if not manager is trying to process randomness", async () => {
        await expect(prizeDistributor.connect(wallet1).processRandomness(drawId)).to.be.revertedWith(
          "Manageable/caller-not-manager"
        );
      });

      it("should fail if manager is trying to process randomness for the future draw", async () => {
        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId.add(1))).to.be.revertedWith(
          "DRB/future-draw"
        );
      });

      it("should fail if draw ID is not equal to the last unpaid draw ID", async () => {
        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId.sub(1))).to.be.revertedWith(
          "PrizeDistributor/draw-id-should-be-the-same-as-last-unpaid-draw-id"
        );
      });

      it("should fail if a draw is not finished yet", async () => {
        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId)).to.be.revertedWith(
          "PrizeDistributor/draw-is-not-finished-yet"
        );
      });

      it("should fail if a draw is already paid", async () => {
        await drawBuffer.connect(wallet1).setPrizeDistributor(wallet1.address);
        await drawBuffer.connect(wallet1).markDrawAsPaid(drawId);

        await increaseTime(500);

        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId)).to.be.revertedWith(
          "PrizeDistributor/draw-is-already-paid"
        );
      });

      it("should fail if randomness isn't requested", async () => {
        await increaseTime(500);

        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId)).to.be.revertedWith(
          "PrizeDistributor/randomness-is-not-requested"
        );
      });

      it("should fail if randomness request isn't completed", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(requestId).returns(false);

        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId)).to.be.revertedWith(
          "PrizeDistributor/randomness-request-is-not-completed"
        );
      });

      it("should fail if randomness length and distribution length are different", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(requestId).returns(true);

        let randomness: BigNumber[] = [];

        await rngServiceChainlinkV2.mock.getRandomNumbers.withArgs(requestId).returns(randomness);

        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId)).to.be.revertedWith(
          "PrizeDistributor/lengths-mismatch"
        );

        randomness = [BigNumber.from(1), BigNumber.from(2)];

        await rngServiceChainlinkV2.mock.getRandomNumbers.withArgs(requestId).returns(randomness);

        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId)).to.be.revertedWith(
          "PrizeDistributor/lengths-mismatch"
        );
      });

      it("should process randomness properly", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(1000), Buffer.from(participantsHash), false);

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(requestId).returns(true);

        const randomness: BigNumber[] = [BigNumber.from(666)];

        await rngServiceChainlinkV2.mock.getRandomNumbers.withArgs(requestId).returns(randomness);

        await expect(prizeDistributor.connect(wallet2).processRandomness(drawId))
          .to.emit(prizeDistributor, "RandomnessProcessed")
          .withArgs(drawId, randomness);

        const lastRngRequest: RngRequest = await prizeDistributor.connect(wallet1).getLastRngRequest();

        expect(lastRngRequest.id).to.equal(BigNumber.from(0));
        expect(lastRngRequest.lockBlock).to.equal(BigNumber.from(0));
        expect(lastRngRequest.requestedAt).to.equal(BigNumber.from(0));

        expect(await prizeDistributor.connect(wallet1).isRngRequested()).to.be.false;
        expect(await prizeDistributor.connect(wallet1).isRngTimedOut()).to.be.false;
      });

      it("should update draw info properly", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(1000), Buffer.from(participantsHash), false);

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(requestId).returns(true);

        const randomness: BigNumber[] = [BigNumber.from(666)];

        await rngServiceChainlinkV2.mock.getRandomNumbers.withArgs(requestId).returns(randomness);

        await prizeDistributor.connect(wallet2).processRandomness(drawId);

        const draw: Draw = await drawBuffer.connect(wallet1).getDraw(drawId);

        expect(draw.randomness).to.deep.equal(randomness);
      });

      it("should change each random number to fit range [0:picksNumber]", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        const picksNumber: BigNumber = BigNumber.from(5000);

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, picksNumber, Buffer.from(participantsHash), false);

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(requestId).returns(true);

        const randomness: BigNumber[] = [BigNumber.from(123456789)];

        await rngServiceChainlinkV2.mock.getRandomNumbers.withArgs(requestId).returns(randomness);

        await prizeDistributor.connect(wallet2).processRandomness(drawId);

        const draw: Draw = await drawBuffer.connect(wallet1).getDraw(drawId);

        for (let i: number = 0; i < randomness.length; ++i) {
          expect(draw.randomness[i]).to.be.equal(randomness[i].mod(picksNumber));
        }
      });

      it("should not change random numbers to fit range [0:picksNumber]", async () => {
        await increaseTime(500);

        const requestId: BigNumber = BigNumber.from(1);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, BigNumber.from(100));

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);

        await rngServiceChainlinkV2.mock.isRequestCompleted.withArgs(requestId).returns(true);

        const randomness: BigNumber[] = [BigNumber.from(123456789)];

        await rngServiceChainlinkV2.mock.getRandomNumbers.withArgs(requestId).returns(randomness);

        await prizeDistributor.connect(wallet2).processRandomness(drawId);

        const draw: Draw = await drawBuffer.connect(wallet1).getDraw(drawId);

        expect(draw.randomness).to.deep.equal(randomness);
      });
    });

    describe("cancelRandomnessRequest()", () => {
      const drawId: BigNumber = BigNumber.from(1);

      beforeEach(async () => {
        await drawBuffer.connect(wallet1).setPrizeDistributor(prizeDistributor.address);
        await drawBuffer.connect(wallet1).pushDraw({
          drawId,
          timestamp: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodStartedAt: BigNumber.from(Math.round(+new Date() / 1000)),
          beaconPeriodSeconds: BigNumber.from(10),
          rngRequestInternalId: BigNumber.from(0),
          participantsHash: "0x",
          randomness: [],
          picksNumber: BigNumber.from(0),
          isEmpty: false,
          paid: false,
        });
      });

      it("should fail if randomness request not timedout", async () => {
        await expect(prizeDistributor.connect(wallet1).cancelRandomnessRequest()).to.be.revertedWith(
          "PrizeDistributor/randomness-request-not-timedout"
        );
      });

      it("should cancel randomness request after timeout properly", async () => {
        await increaseTime(1000);

        const requestId: BigNumber = BigNumber.from(1);
        const lockBlock: BigNumber = BigNumber.from(100);

        await rngServiceChainlinkV2.mock.requestRandomNumbers
          .withArgs(BigNumber.from(distribution.length))
          .returns(requestId, lockBlock);

        await prizeDistributor
          .connect(wallet2)
          .requestRandomness(drawId, BigNumber.from(0), Buffer.from(participantsHash), false);

        await increaseTime(rngTimeout.toNumber());

        await expect(prizeDistributor.connect(wallet1).cancelRandomnessRequest())
          .to.emit(prizeDistributor, "RandomnessRequestCancelled")
          .withArgs(requestId, lockBlock);

        const lastRngRequest: RngRequest = await prizeDistributor.connect(wallet1).getLastRngRequest();

        expect(lastRngRequest.id).to.equal(BigNumber.from(0));
        expect(lastRngRequest.lockBlock).to.equal(BigNumber.from(0));
        expect(lastRngRequest.requestedAt).to.equal(BigNumber.from(0));
      });
    });

    describe("withdrawERC20()", () => {
      const withdrawAmount: BigNumber = toWei("100");

      beforeEach(async () => {
        await dai.connect(wallet1).mint(prizeDistributor.address, toWei("1000"));
      });

      it("should fail to withdraw ERC20 tokens as unauthorized account", async () => {
        expect(
          prizeDistributor.connect(wallet2).withdrawERC20(dai.address, wallet1.address, withdrawAmount)
        ).to.be.revertedWith("Ownable/caller-not-owner");
      });

      it("should fail to withdraw ERC20 tokens if recipient address is address zero", async () => {
        await expect(
          prizeDistributor.connect(wallet1).withdrawERC20(dai.address, AddressZero, withdrawAmount)
        ).to.be.revertedWith("PrizeDistributor/recipient-not-zero-address");
      });

      it("should fail to withdraw ERC20 tokens if token address is address zero", async () => {
        await expect(
          prizeDistributor.connect(wallet1).withdrawERC20(AddressZero, wallet1.address, withdrawAmount)
        ).to.be.revertedWith("PrizeDistributor/ERC20-not-zero-address");
      });

      it("should succeed to withdraw ERC20 tokens as owner", async () => {
        await expect(prizeDistributor.connect(wallet1).withdrawERC20(dai.address, wallet1.address, withdrawAmount))
          .to.emit(prizeDistributor, "ERC20Withdrawn")
          .withArgs(dai.address, wallet1.address, withdrawAmount);
      });
    });

    describe("setDrawBuffer()", () => {
      it("should fail if not an owner is trying to set a DrawBuffer", async () => {
        await expect(prizeDistributor.connect(wallet2).setDrawBuffer(drawBuffer.address)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });

      it("should fail if a new DrawBuffer is address zero", async () => {
        await expect(prizeDistributor.connect(wallet1).setDrawBuffer(AddressZero)).to.be.revertedWith(
          "PrizeDistributor/draw-buffer-not-zero-address"
        );
      });

      it("should properly set a new DrawBuffer by an owner", async () => {
        const drawBuffer: Contract = await upgrades.deployProxy(drawBufferFactory, [
          wallet1.address,
          BigNumber.from(255),
        ]);

        await expect(prizeDistributor.connect(wallet1).setDrawBuffer(drawBuffer.address))
          .to.emit(prizeDistributor, "DrawBufferSet")
          .withArgs(drawBuffer.address);

        expect(await prizeDistributor.connect(wallet1).getDrawBuffer()).to.equal(drawBuffer.address);
      });
    });

    describe("setPrizeDistributionBuffer()", () => {
      it("should fail if not an owner is trying to set a PrizeDistributionBuffer", async () => {
        await expect(
          prizeDistributor.connect(wallet2).setPrizeDistributionBuffer(prizeDistributionBuffer.address)
        ).to.be.revertedWith("Ownable/caller-not-owner");
      });

      it("should fail if a new PrizeDistributionBuffer is address zero", async () => {
        await expect(prizeDistributor.connect(wallet1).setPrizeDistributionBuffer(AddressZero)).to.be.revertedWith(
          "PrizeDistributor/prize-distribution-buffer-not-zero-address"
        );
      });

      it("should properly set a new PrizeDistributionBuffer by an owner", async () => {
        const prizeDistributionBuffer: Contract = await upgrades.deployProxy(prizeDistributionBuferFactory, [
          wallet1.address,
          BigNumber.from(5),
        ]);

        await expect(prizeDistributor.connect(wallet1).setPrizeDistributionBuffer(prizeDistributionBuffer.address))
          .to.emit(prizeDistributor, "PrizeDistributionBufferSet")
          .withArgs(prizeDistributionBuffer.address);

        expect(await prizeDistributor.connect(wallet1).getPrizeDistributionBuffer()).to.equal(
          prizeDistributionBuffer.address
        );
      });
    });

    describe("setRngService()", () => {
      it("should fail if not an owner is trying to set an RNGServiceChainlinkV2", async () => {
        await expect(prizeDistributor.connect(wallet2).setRngService(rngServiceChainlinkV2.address)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });

      it("should fail if a new RNGServiceChainlinkV2 is address zero", async () => {
        await expect(prizeDistributor.connect(wallet1).setRngService(AddressZero)).to.be.revertedWith(
          "PrizeDistributor/rng-service-not-zero-address"
        );
      });

      it("should properly set a new RNGServiceChainlinkV2 by an owner", async () => {
        const rngServiceChainlinkV2: Contract = await deployMockContract(wallet1, RNGServiceChainlinkV2.abi);

        await expect(prizeDistributor.connect(wallet1).setRngService(rngServiceChainlinkV2.address))
          .to.emit(prizeDistributor, "RngServiceSet")
          .withArgs(rngServiceChainlinkV2.address);

        expect(await prizeDistributor.connect(wallet1).getRngService()).to.equal(rngServiceChainlinkV2.address);
      });
    });

    describe("setDistribution()", () => {
      it("should fail if not an owner is trying to set a distribution", async () => {
        await expect(prizeDistributor.connect(wallet2).setDistribution(distribution)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });

      it("should fail if distribution length is wrong", async () => {
        await expect(prizeDistributor.connect(wallet1).setDistribution(Array(500 + 1).fill(1))).to.be.revertedWith(
          "PrizeDistributor/wrong-array-length"
        );
      });

      it("should fail if total distribution is not equal to 100%", async () => {
        await expect(prizeDistributor.connect(wallet1).setDistribution([BigNumber.from(9999)])).to.be.revertedWith(
          "PrizeDistributor/distribution-should-be-equal-to-100%"
        );
        await expect(prizeDistributor.connect(wallet1).setDistribution([BigNumber.from(10001)])).to.be.revertedWith(
          "PrizeDistributor/distribution-should-be-equal-to-100%"
        );
        await expect(prizeDistributor.connect(wallet1).setDistribution([])).to.be.revertedWith(
          "PrizeDistributor/distribution-should-be-equal-to-100%"
        );
      });

      it("should properly set a new distribution by an owner", async () => {
        const newDistribution: BigNumber[] = [BigNumber.from(5000), BigNumber.from(3000), BigNumber.from(2000)];

        await expect(prizeDistributor.connect(wallet1).setDistribution(newDistribution))
          .to.emit(prizeDistributor, "DistributionSet")
          .withArgs(newDistribution);

        expect(await prizeDistributor.connect(wallet1).getDistribution()).to.deep.equal(newDistribution);
      });
    });

    describe("setRngTimeout()", () => {
      it("should fail if not an owner is trying to set an RNGServiceChainlinkV2 timeout", async () => {
        await expect(prizeDistributor.connect(wallet2).setRngTimeout(rngTimeout)).to.be.revertedWith(
          "Ownable/caller-not-owner"
        );
      });

      it("should fail if a new RNGServiceChainlinkV2 timeout is lte 60", async () => {
        await expect(prizeDistributor.connect(wallet1).setRngTimeout(BigNumber.from(60))).to.be.revertedWith(
          "PrizeDistributor/rng-timeout-gt-60-seconds"
        );
      });

      it("should properly set a new RNGServiceChainlinkV2 timeout by an owner", async () => {
        const newRngTimeout: BigNumber = BigNumber.from(3600); // 1 hour (in seconds)

        await expect(prizeDistributor.connect(wallet1).setRngTimeout(newRngTimeout))
          .to.emit(prizeDistributor, "RngTimeoutSet")
          .withArgs(newRngTimeout);

        expect(await prizeDistributor.connect(wallet1).getRngTimeout()).to.be.equal(newRngTimeout);
      });
    });
  });
});
