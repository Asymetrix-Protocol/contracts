import { BigNumber, constants, Contract, ContractFactory, ContractTransaction, utils } from "ethers";

import { getFirstLidoRebaseTimestamp } from "../../../scripts/helpers/getFirstLidoRebaseTimestamp";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import hardhat, { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { parseEther: toWei } = utils;
const { AddressZero } = constants;

describe("StakePrizePool", function () {
  let wallet: SignerWithAddress;

  let initializeTx: ContractTransaction;

  let StakePrizePool: ContractFactory;
  let DrawBeacon: ContractFactory;
  let DrawBuffer: ContractFactory;
  let Ticket: ContractFactory;
  let ASX: ContractFactory;

  let stakeToken: Contract;
  let drawBeacon: Contract;
  let drawBuffer: Contract;
  let prizePool: Contract;
  let ticket: Contract;
  let asx: Contract;

  let snapshotId: BigNumber;

  let isConstructorTest: boolean = false;

  const deployStakePrizePool = async (stakeTokenAddress: string = stakeToken.address) => {
    ASX = await hardhat.ethers.getContractFactory("ASX", wallet);
    asx = await upgrades.deployProxy(
      ASX,
      ["Asymetrix Governance Token", "ASX", ethers.utils.parseEther("100000000"), wallet.address],
      { initializer: "initialize" }
    );

    StakePrizePool = await hardhat.ethers.getContractFactory("StakePrizePool", wallet);
    prizePool = await upgrades.deployProxy(StakePrizePool, [
      wallet.address,
      stakeTokenAddress,
      asx.address,
      BigNumber.from(ethers.utils.parseEther("10000000")),
      BigNumber.from("604800"),
      BigNumber.from("86400"),
      BigNumber.from("14400"), // 4 hours
      getFirstLidoRebaseTimestamp(),
      BigNumber.from("500"), // 5.00%
    ]);
    initializeTx = prizePool.deployTransaction;

    Ticket = await hardhat.ethers.getContractFactory("Ticket");
    ticket = await upgrades.deployProxy(Ticket, ["name", "SYMBOL", 18, prizePool.address]);

    DrawBuffer = await hardhat.ethers.getContractFactory("DrawBuffer");
    drawBuffer = await upgrades.deployProxy(DrawBuffer, [wallet.address, 3]);

    DrawBeacon = await hardhat.ethers.getContractFactory("DrawBeacon");
    drawBeacon = await upgrades.deployProxy(DrawBeacon, [
      wallet.address,
      drawBuffer.address,
      1,
      Math.round(new Date().getTime() / 1000),
      1000,
    ]);

    await prizePool.setDrawBeacon(drawBeacon.address);
    await prizePool.setTicket(ticket.address);
  };

  before(async () => {
    [wallet] = await hardhat.ethers.getSigners();

    const ERC20Mintable: ContractFactory = await hardhat.ethers.getContractFactory(
      "contracts/core/test/ERC20Mintable.sol:ERC20Mintable"
    );

    stakeToken = await upgrades.deployProxy(ERC20Mintable, ["name", "SSYMBOL"]);
  });

  beforeEach(async () => {
    snapshotId = await hardhat.network.provider.send("evm_snapshot");

    if (!isConstructorTest) {
      await deployStakePrizePool();
    }
  });

  afterEach(async () => {
    await hardhat.network.provider.send("evm_revert", [snapshotId]);
  });

  describe("initialize()", () => {
    before(() => {
      isConstructorTest = true;
    });

    after(() => {
      isConstructorTest = false;
    });

    it("should fail if `initialize()` method is called more than once", async () => {
      await deployStakePrizePool();

      await expect(
        prizePool.initialize(
          wallet.address,
          stakeToken.address,
          asx.address,
          BigNumber.from(ethers.utils.parseEther("10000000")),
          BigNumber.from("604800"),
          BigNumber.from("86400"),
          BigNumber.from("14400"), // 4 hours
          getFirstLidoRebaseTimestamp(),
          BigNumber.from("500") // 5.00%
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should initialize StakePrizePool", async () => {
      await deployStakePrizePool();

      await expect(initializeTx).to.emit(prizePool, "Deployed").withArgs(stakeToken.address);
    });

    it("should fail to initialize StakePrizePool if stakeToken is address zero", async () => {
      await expect(deployStakePrizePool(AddressZero)).to.be.revertedWith("StakePrizePool/stake-token-not-zero-address");
    });
  });

  describe("_redeem()", () => {
    it("should return amount staked", async () => {
      const amount: BigNumber = toWei("100");

      await stakeToken.connect(wallet).approve(prizePool.address, amount);
      await stakeToken.connect(wallet).mint(wallet.address, amount);

      await prizePool.connect(wallet).depositTo(wallet.address, amount);

      await expect(prizePool.connect(wallet).withdrawFrom(wallet.address, amount)).to.emit(prizePool, "Withdrawal");
    });
  });

  describe("canAwardExternal()", () => {
    it("should not allow the stake award", async () => {
      expect(await prizePool.connect(wallet).canAwardExternal(stakeToken.address)).to.be.false;
    });
  });

  describe("balance()", () => {
    it("should return the staked balance", async () => {
      const amount: BigNumber = toWei("100");

      await stakeToken.connect(wallet).approve(prizePool.address, amount);
      await stakeToken.connect(wallet).mint(wallet.address, amount);

      await prizePool.connect(wallet).depositTo(wallet.address, amount);

      expect(await prizePool.callStatic.balance()).to.equal(amount);
    });
  });

  describe("token()", () => {
    it("should return the staked token", async () => {
      expect(await prizePool.connect(wallet).getToken()).to.equal(stakeToken.address);
    });
  });
});
