import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { Signer } from "@ethersproject/abstract-signer";

import { artifacts, ethers, upgrades } from "hardhat";

import { BigNumber, ContractFactory } from "ethers";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const { constants, getContractFactory, getSigners, utils } = ethers;
const { parseEther: toWei } = utils;
const { AddressZero } = constants;

let isConstructorTest: boolean = false;

describe("ControlledToken", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let controller: MockContract;

  let PrizePool: Artifact;

  // Conflict between types for `call` and `deploy`, so we use `any`
  let token: any;

  const deployToken = async (controllerAddres: string = controller.address, decimals: number = 18) => {
    const ControlledToken: ContractFactory = await getContractFactory("ControlledTokenHarness", wallet1);

    token = await upgrades.deployProxy(ControlledToken, ["Name", "Symbol", decimals, controllerAddres]);

    await token.deployed();
  };

  beforeEach(async () => {
    [wallet1, wallet2] = await getSigners();

    PrizePool = await artifacts.readArtifact("PrizePool");

    controller = await deployMockContract(wallet1 as Signer, PrizePool.abi);

    if (!isConstructorTest) {
      await deployToken();
    }
  });

  describe("initialize()", () => {
    beforeEach(async () => {
      isConstructorTest = true;

      await deployToken();
    });

    after(async () => {
      isConstructorTest = false;
    });

    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(token.connect(wallet1).initialize("Name", "Symbol", 18, controller.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        token.connect(wallet1).testOnlyInitializingModifier("Name", "Symbol", 18, controller.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail to deploy token if controller is address zero", async () => {
      await expect(deployToken(AddressZero)).to.be.revertedWith("ControlledToken/controller-not-zero-address");
    });

    it("should fail to deploy token if decimals is zero", async () => {
      await expect(deployToken(controller.address, 0)).to.be.revertedWith("ControlledToken/decimals-gt-zero");
    });
  });

  describe("controllerMint()", () => {
    it("should allow the controller to mint tokens", async () => {
      const amount: BigNumber = toWei("10");

      await controller.call(token, "controllerMint", wallet1.address, amount);

      expect(await token.connect(wallet1).balanceOf(wallet1.address)).to.equal(amount);
    });

    it("should only be callable by the controller", async () => {
      const amount: BigNumber = toWei("10");

      await expect(token.connect(wallet1).controllerMint(wallet1.address, amount)).to.be.revertedWith(
        "ControlledToken/only-controller"
      );
    });
  });

  describe("controllerBurn()", () => {
    it("should allow the controller to burn tokens", async () => {
      const amount: BigNumber = toWei("10");

      await controller.call(token, "controllerMint", wallet1.address, amount);

      expect(await token.connect(wallet1).balanceOf(wallet1.address)).to.equal(amount);

      await controller.call(token, "controllerBurn", wallet1.address, amount);

      expect(await token.connect(wallet1).balanceOf(wallet1.address)).to.equal("0");
    });

    it("should only be callable by the controller", async () => {
      const amount: BigNumber = toWei("10");

      await expect(token.connect(wallet1).controllerBurn(wallet1.address, amount)).to.be.revertedWith(
        "ControlledToken/only-controller"
      );
    });
  });

  describe("controllerBurnFrom()", () => {
    it("should allow the controller to burn for someone", async () => {
      const amount: BigNumber = toWei("10");

      await controller.call(token, "controllerMint", wallet1.address, amount);
      await token.connect(wallet1).approve(wallet2.address, amount);
      await controller.call(token, "controllerBurnFrom", wallet2.address, wallet1.address, amount);

      expect(await token.connect(wallet1).balanceOf(wallet1.address)).to.equal("0");
      expect(await token.connect(wallet1).allowance(wallet1.address, wallet2.address)).to.equal("0");
    });

    it("should not allow non-approved users to burn", async () => {
      const amount: BigNumber = toWei("10");

      await controller.call(token, "controllerMint", wallet1.address, amount);

      await expect(controller.call(token, "controllerBurnFrom", wallet2.address, wallet1.address, amount)).to.be
        .reverted;
    });

    it("should allow a user to burn their own", async () => {
      const amount: BigNumber = toWei("10");

      await controller.call(token, "controllerMint", wallet1.address, amount);

      await controller.call(token, "controllerBurnFrom", wallet1.address, wallet1.address, amount);

      expect(await token.connect(wallet1).balanceOf(wallet1.address)).to.equal("0");
    });

    it("should only be callable by the controller", async () => {
      const amount: BigNumber = toWei("10");

      await expect(
        token.connect(wallet1).controllerBurnFrom(wallet2.address, wallet1.address, amount)
      ).to.be.revertedWith("ControlledToken/only-controller");
    });
  });

  describe("decimals()", () => {
    it("should return the number of decimals", async () => {
      expect(await token.connect(wallet1).decimals()).to.equal(18);
    });
  });
});
