import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Contract, ContractFactory } from "ethers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { constants } = ethers;
const { AddressZero } = constants;

describe("Ownable", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;
  let wallet4: SignerWithAddress;

  let ownable: Contract;

  beforeEach(async () => {
    [wallet1, wallet2, wallet3, wallet4] = await ethers.getSigners();

    const ownableFactory: ContractFactory = await ethers.getContractFactory("OwnableHarness");

    ownable = await upgrades.deployProxy(ownableFactory, [wallet1.address]);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(ownable.connect(wallet1).initialize(wallet1.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing", async () => {
      await expect(ownable.connect(wallet1).testOnlyInitializingModifier(wallet1.address)).to.be.revertedWith(
        "Initializable: contract is not initializing"
      );
    });
  });

  describe("owner()", () => {
    it("should be deployer address by default", async () => {
      expect(await ownable.connect(wallet1).owner()).to.equal(wallet1.address);
    });
  });

  describe("pendingOwner()", () => {
    it("should be address zero by default", async () => {
      expect(await ownable.connect(wallet1).pendingOwner()).to.equal(AddressZero);
    });
  });

  describe("transferOwnership()", () => {
    it("should transfer ownership to wallet2", async () => {
      await expect(ownable.connect(wallet1).transferOwnership(wallet2.address))
        .to.emit(ownable, "OwnershipOffered")
        .withArgs(wallet2.address);

      expect(await ownable.connect(wallet1).pendingOwner()).to.equal(wallet2.address);
    });

    it("should fail to transfer ownership to address zero", async () => {
      await expect(ownable.connect(wallet1).transferOwnership(AddressZero)).to.be.revertedWith(
        "Ownable/pendingOwner-not-zero-address"
      );
    });

    it("should fail to transfer ownership if not currently owner", async () => {
      await expect(ownable.connect(wallet2).transferOwnership(wallet3.address)).to.be.revertedWith(
        "Ownable/caller-not-owner"
      );
    });
  });

  describe("claimOwnership()", () => {
    beforeEach(async () => {
      await ownable.connect(wallet1).transferOwnership(wallet2.address);
    });

    it("should be claimed by pending owner", async () => {
      expect(await ownable.connect(wallet2).claimOwnership())
        .to.emit(ownable, "OwnershipTransferred")
        .withArgs(wallet1.address, wallet2.address);

      expect(await ownable.connect(wallet1).owner()).to.equal(wallet2.address);
      expect(await ownable.connect(wallet1).pendingOwner()).to.equal(AddressZero);
    });

    it("should fail to claim ownership if not pending owner", async () => {
      await expect(ownable.connect(wallet3).claimOwnership()).to.be.revertedWith("Ownable/caller-not-pendingOwner");
    });
  });

  describe("renounceOwnership()", () => {
    beforeEach(async () => {
      await ownable.connect(wallet1).transferOwnership(wallet2.address);
      await ownable.connect(wallet2).claimOwnership();
    });

    it("should succeed to renounce ownership if owner", async () => {
      expect(await ownable.connect(wallet2).renounceOwnership())
        .to.emit(ownable, "OwnershipTransferred")
        .withArgs(wallet2.address, AddressZero);

      expect(await ownable.connect(wallet1).owner()).to.equal(AddressZero);
      expect(await ownable.connect(wallet1).pendingOwner()).to.equal(AddressZero);
    });

    it("should fail to renounce ownership if not owner", async () => {
      await expect(ownable.connect(wallet3).renounceOwnership()).to.be.revertedWith("Ownable/caller-not-owner");
    });
  });

  describe("onlyOwner()", () => {
    it("should fail to call permissioned function if not owner", async () => {
      await expect(ownable.connect(wallet3).protectedFunction()).to.be.revertedWith("Ownable/caller-not-owner");
    });

    it("should call permissioned function if owner", async () => {
      await expect(ownable.connect(wallet1).protectedFunction()).to.emit(ownable, "ReallyCoolEvent");
    });
  });
});
