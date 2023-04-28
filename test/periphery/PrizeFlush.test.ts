import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { BigNumber, Contract, ContractFactory } from "ethers";

import { Signer } from "@ethersproject/abstract-signer";

import { ethers, artifacts, upgrades } from "hardhat";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const { constants, getSigners, utils } = ethers;
const { parseEther: toWei } = utils;
const { AddressZero } = constants;

describe("PrizeFlush", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;

  let erc20MintableFactory: ContractFactory;
  let prizeFlushFactory: ContractFactory;
  let reserveFactory: ContractFactory;

  let prizePool: MockContract;

  let prizeFlush: Contract;
  let reserve: Contract;
  let ticket: Contract;

  let destination: string;

  before(async () => {
    [wallet1, wallet2, wallet3] = await getSigners();

    destination = wallet3.address;

    erc20MintableFactory = await ethers.getContractFactory("contracts/core/test/ERC20Mintable.sol:ERC20Mintable");

    prizeFlushFactory = await ethers.getContractFactory("PrizeFlush");

    reserveFactory = await ethers.getContractFactory("ReserveHarness");

    const PrizePool: Artifact = await artifacts.readArtifact("StakePrizePool");

    prizePool = await deployMockContract(wallet1, PrizePool.abi);
  });

  beforeEach(async () => {
    ticket = await upgrades.deployProxy(erc20MintableFactory, ["Ticket", "TICK"]);

    reserve = await upgrades.deployProxy(reserveFactory, [wallet1.address, ticket.address]);

    prizeFlush = await upgrades.deployProxy(prizeFlushFactory, [
      wallet1.address,
      destination,
      reserve.address,
      prizePool.address,
    ]);

    await reserve.connect(wallet1).setManager(prizeFlush.address);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        prizeFlush.connect(wallet1).initialize(wallet1.address, destination, reserve.address, prizePool.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Getters", () => {
    it("should get the destination address", async () => {
      expect(await prizeFlush.connect(wallet1).getDestination()).to.equal(destination);
    });

    it("should get the prizePool address", async () => {
      expect(await prizeFlush.connect(wallet1).getPrizePool()).to.equal(prizePool.address);
    });

    it("should get the reserve address", async () => {
      expect(await prizeFlush.connect(wallet1).getReserve()).to.equal(reserve.address);
    });
  });

  describe("Setters", () => {
    it("should fail to set the destination address if not called by owner", async () => {
      await expect(prizeFlush.connect(wallet3 as unknown as Signer).setDestination(wallet3.address)).to.revertedWith(
        "Ownable/caller-not-owner"
      );
    });

    it("should fail to set the destination address if address zero is passed", async () => {
      await expect(prizeFlush.connect(wallet1).setDestination(AddressZero)).to.revertedWith(
        "Flush/destination-not-zero-address"
      );
    });

    it("should set the destination address", async () => {
      await expect(prizeFlush.connect(wallet1).setDestination(wallet3.address)).to.emit(prizeFlush, "DestinationSet");
    });

    it("should fail to set the prizePool address", async () => {
      await expect(prizeFlush.connect(wallet3 as unknown as Signer).setPrizePool(wallet3.address)).to.revertedWith(
        "Ownable/caller-not-owner"
      );
    });

    it("should fail to set the  prizePool address from not owner", async () => {
      await expect(prizeFlush.connect(wallet3 as unknown as Signer).setPrizePool(wallet3.address)).to.revertedWith(
        "Ownable/caller-not-owner"
      );
    });

    it("should fail to set the prizePool address if address zero is passed", async () => {
      await expect(prizeFlush.connect(wallet1).setPrizePool(AddressZero)).to.revertedWith(
        "Flush/prizePool-not-zero-address"
      );
    });

    it("should set the prizePool address", async () => {
      await expect(prizeFlush.connect(wallet1).setPrizePool(wallet3.address)).to.emit(prizeFlush, "PrizePoolSet");
    });

    it("should fail to set the protocol fee percentage from not owner", async () => {
      await expect(prizeFlush.connect(wallet3 as unknown as Signer).setProtocolFeePercentage(200)).to.revertedWith(
        "Ownable/caller-not-owner"
      );
    });

    it("should fail to set the protocol fee percentage  if input is greater than 1000", async () => {
      await expect(prizeFlush.connect(wallet1).setProtocolFeePercentage(1001)).to.revertedWith(
        "Flush/feePercentage-greater-100%"
      );
    });

    it("should set the protocol fee percentage", async () => {
      await expect(prizeFlush.connect(wallet1).setProtocolFeePercentage(200)).to.emit(
        prizeFlush,
        "ProtocolPercentageSet"
      );

      const obtainedProtocolFeePercentage: BigNumber = await prizeFlush.getProtocolFeePercentage();

      expect(obtainedProtocolFeePercentage).to.equal(200);
    });

    it("should fail to set the protocol fee recipient from not owner", async () => {
      await expect(
        prizeFlush.connect(wallet3 as unknown as Signer).setProtocolFeeRecipient(wallet3.address)
      ).to.revertedWith("Ownable/caller-not-owner");
    });

    it("should fail to set the protocol fee recipient if address zero is passed", async () => {
      await expect(prizeFlush.connect(wallet1).setProtocolFeeRecipient(AddressZero)).to.revertedWith(
        "Flush/feeRecipient-not-zero-address"
      );
    });

    it("should set the protocol fee recipient address", async () => {
      await expect(prizeFlush.setProtocolFeeRecipient(wallet3.address)).to.emit(prizeFlush, "ProtocolFeeRecipientSet");

      const obtainedProtocolFeeRecipient: string = await prizeFlush.getProtocolFeeRecipient();

      expect(obtainedProtocolFeeRecipient).to.equal(wallet3.address);
    });

    it("should fail to set the reserve address", async () => {
      await expect(prizeFlush.connect(wallet3 as unknown as Signer).setReserve(wallet3.address)).to.revertedWith(
        "Ownable/caller-not-owner"
      );
    });

    it("should fail to set the reserve address if address zero is passed", async () => {
      await expect(prizeFlush.connect(wallet1).setReserve(AddressZero)).to.revertedWith(
        "Flush/reserve-not-zero-address"
      );
    });

    it("should set the reserve address", async () => {
      await expect(prizeFlush.connect(wallet1).setReserve(wallet3.address)).to.emit(prizeFlush, "ReserveSet");
    });
  });

  describe("Core", () => {
    describe("flush()", () => {
      it("should succeed to flush prizes if positive balance on reserve.", async () => {
        await prizePool.mock.captureAwardBalance.returns(toWei("100"));
        await prizePool.mock.getTicket.returns(ticket.address);
        await prizePool.mock.award.returns();

        await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

        await expect(prizeFlush.connect(wallet1).flush())
          .to.emit(prizeFlush, "Flushed")
          .and.to.emit(reserve, "Withdrawn");
      });

      it("should succeed to flush if manager", async () => {
        await prizePool.mock.captureAwardBalance.returns(toWei("100"));
        await prizePool.mock.getTicket.returns(ticket.address);
        await prizePool.mock.award.returns();

        await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

        await prizeFlush.connect(wallet1).setManager(wallet2.address);

        await expect(prizeFlush.connect(wallet2).flush())
          .to.emit(prizeFlush, "Flushed")
          .and.to.emit(reserve, "Withdrawn");
      });

      it("should fail to flush if not manager or owner", async () => {
        await prizeFlush.connect(wallet1).setManager(wallet2.address);

        await expect(prizeFlush.connect(wallet3).flush()).to.be.revertedWith("Manageable/caller-not-manager-or-owner");
      });

      it("should fail to flush if zero balance on reserve", async () => {
        await prizePool.mock.captureAwardBalance.returns(toWei("0"));
        await prizePool.mock.getTicket.returns(ticket.address);
        await prizePool.mock.award.returns();

        await expect(prizeFlush.connect(wallet1).flush()).to.not.emit(prizeFlush, "Flushed");
      });

      it("should properly charge protocol fee from flushed amount", async () => {
        const amount: BigNumber = toWei("100");

        await prizeFlush.connect(wallet1).setProtocolFeeRecipient(wallet2.address);
        await prizeFlush.connect(wallet1).setProtocolFeePercentage(BigNumber.from(200));

        await prizePool.mock.captureAwardBalance.returns(amount);
        await prizePool.mock.getTicket.returns(ticket.address);
        await prizePool.mock.award.returns();

        await prizeFlush.connect(wallet1).flush();
      });

      it("should not award if amounts is too small", async () => {
        const amount: BigNumber = BigNumber.from(1);

        await prizeFlush.connect(wallet1).setProtocolFeeRecipient(wallet2.address);
        await prizeFlush.connect(wallet1).setProtocolFeePercentage(BigNumber.from(200));

        await prizePool.mock.captureAwardBalance.returns(amount);
        await prizePool.mock.getTicket.returns(ticket.address);
        await prizePool.mock.award.returns();

        await prizeFlush.connect(wallet1).flush();

        await prizeFlush.connect(wallet1).setProtocolFeePercentage(BigNumber.from(0));

        await prizeFlush.connect(wallet1).flush();
      });
    });
  });
});
