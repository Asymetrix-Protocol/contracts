import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { Contract, ContractFactory } from "ethers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { constants } = ethers;
const { AddressZero } = constants;

describe("Manageable", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;
  let wallet4: SignerWithAddress;

  let manageable: Contract;

  beforeEach(async () => {
    [wallet1, wallet2, wallet3, wallet4] = await ethers.getSigners();

    const manageableFactory: ContractFactory = await ethers.getContractFactory("ManageableHarness");

    manageable = await upgrades.deployProxy(manageableFactory, [wallet1.address]);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(manageable.connect(wallet1).initialize(wallet1.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing", async () => {
      await expect(manageable.connect(wallet1).testOnlyInitializingModifier(wallet1.address)).to.be.revertedWith(
        "Initializable: contract is not initializing"
      );
    });
  });

  describe("manager()", () => {
    it("should be address zero by default", async () => {
      expect(await manageable.connect(wallet1).manager()).to.equal(AddressZero);
    });
  });

  describe("setManager()", () => {
    it("should set manager", async () => {
      expect(await manageable.connect(wallet1).setManager(wallet2.address))
        .to.emit(manageable, "ManagerTransferred")
        .withArgs(AddressZero, wallet2.address);

      expect(await manageable.connect(wallet1).manager()).to.equal(wallet2.address);
    });

    it("should set manager to address zero", async () => {
      await manageable.connect(wallet1).setManager(wallet2.address);

      expect(await manageable.connect(wallet1).setManager(AddressZero))
        .to.emit(manageable, "ManagerTransferred")
        .withArgs(wallet2.address, AddressZero);

      expect(await manageable.connect(wallet1).manager()).to.equal(AddressZero);
    });

    it("should fail if not an owner is trying to set a manager", async () => {
      await expect(manageable.connect(wallet2).setManager(wallet2.address)).to.be.revertedWith(
        "Ownable/caller-not-owner"
      );
    });

    it("should fail to set manager if already manager", async () => {
      await manageable.connect(wallet1).setManager(wallet2.address);

      await expect(manageable.connect(wallet1).setManager(wallet2.address)).to.be.revertedWith(
        "Manageable/existing-manager-address"
      );
    });
  });

  describe("onlyManager()", () => {
    it("should fail to call permissioned function if not manager", async () => {
      await expect(manageable.connect(wallet1).connect(wallet3).protectedFunctionManager()).to.be.revertedWith(
        "Manageable/caller-not-manager"
      );
    });

    it("should call permissioned function if manager", async () => {
      await manageable.connect(wallet1).setManager(wallet2.address);

      await expect(manageable.connect(wallet2).protectedFunctionManager()).to.emit(manageable, "ReallyCoolEvent");
    });
  });

  describe("onlyManagerOrOwner()", () => {
    it("should fail to call permissioned function if not manager or owner", async () => {
      await expect(manageable.connect(wallet3).protectedFunctionManagerOrOwner()).to.be.revertedWith(
        "Manageable/caller-not-manager-or-owner"
      );
    });

    it("should call permissioned function if manager", async () => {
      await manageable.connect(wallet1).setManager(wallet2.address);

      await expect(manageable.connect(wallet2).protectedFunctionManagerOrOwner()).to.emit(
        manageable,
        "ReallyCoolEvent"
      );
    });

    it("should call permissioned function if owner", async () => {
      await expect(manageable.connect(wallet1).protectedFunctionManagerOrOwner()).to.emit(
        manageable,
        "ReallyCoolEvent"
      );
    });
  });
});
