import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, Contract, ContractFactory } from "ethers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

describe("ASX", () => {
  let user: SignerWithAddress;

  let ASX: ContractFactory;

  let asx: Contract;

  const name: string = "Asymetrix Token";
  const symbol: string = "ASX";
  const cap: BigNumber = ethers.utils.parseEther("100000000");

  before("setup", async () => {
    [user] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const initialSupplyReceiver: string = user.address;

    ASX = await ethers.getContractFactory("ASXHarness");
    asx = await upgrades.deployProxy(ASX, [name, symbol, cap, initialSupplyReceiver]);

    await asx.deployed();
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(asx.connect(user).initialize(name, symbol, cap, user.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing - 1", async () => {
      await expect(
        asx
          .connect(user)
          ["testOnlyInitializingModifier(string,string,uint256,address)"](name, symbol, cap, user.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if contract is not initializing - 2", async () => {
      await expect(
        asx.connect(user)["testOnlyInitializingModifier(address,uint256)"](user.address, cap)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should properly deploy ASX token and pre-mint all tokens", async () => {
      const initialSupplyReceiver: string = user.address;
      const asx: Contract = await upgrades.deployProxy(ASX, [name, symbol, cap, initialSupplyReceiver]);

      await asx.deployed();

      expect(await asx.name()).to.equal(name);
      expect(await asx.symbol()).to.equal(symbol);
      expect(await asx.decimals()).to.equal(BigNumber.from(18));
      expect(await asx.cap()).to.equal(cap);
      expect(await asx.balanceOf(initialSupplyReceiver)).to.equal(cap);
      expect(await asx.totalSupply()).to.equal(cap);
    });
  });

  describe("burn()", () => {
    it("should burn properly", async () => {
      const amount: BigNumber = ethers.utils.parseEther("1");

      await asx.connect(user).burn(amount);

      expect(await asx.connect(user).balanceOf(user.address)).to.equal(cap.sub(amount));
    });
  });
});
