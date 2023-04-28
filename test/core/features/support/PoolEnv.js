const hardhat = require("hardhat");
const { expect } = require("chai");

require("../../helpers/chaiMatchers");

const { ethers, deployments } = hardhat;

const { AddressZero } = ethers.constants;

const debug = require("debug")("pt:PoolEnv.js");

const toWei = (val) => ethers.utils.parseEther("" + val);

function PoolEnv() {
  this.overrides = { gasLimit: 9500000 };

  this.ready = async function () {
    await deployments.fixture();
    this.wallets = await ethers.getSigners();
  };

  this.wallet = async function (id) {
    let wallet = this.wallets[id];
    return wallet;
  };

  this.token = async function (wallet) {
    return (await ethers.getContract("StakeToken")).connect(wallet);
  };

  this.ticket = async (wallet) => (await ethers.getContract("Ticket")).connect(wallet);

  this.prizePool = async (wallet) => (await ethers.getContract("StakePrizePool")).connect(wallet);

  this.drawBeacon = async () => await ethers.getContract("DrawBeacon");

  this.drawBuffer = async () => await ethers.getContract("DrawBuffer");

  this.prizeDistributionBuffer = async () => await ethers.getContract("PrizeDistributionBuffer");

  this.drawCalculator = async () => await ethers.getContract("DrawCalculator");

  this.prizeDistributor = async (wallet) => (await ethers.getContract("PrizeDistributor")).connect(wallet);

  this.buyTickets = async function ({ user, tickets }) {
    debug(`Buying tickets...`);
    const owner = await this.wallet(0);
    let wallet = await this.wallet(user);

    debug("wallet is ", wallet.address);
    let token = await this.token(wallet);
    let ticket = await this.ticket(wallet);
    let prizePool = await this.prizePool(wallet);

    let amount = toWei(tickets);

    let balance = await token.balanceOf(wallet.address);

    if (balance.lt(amount)) {
      await token.mint(wallet.address, amount, this.overrides);
    }

    await token.approve(prizePool.address, amount, this.overrides);

    debug(`Depositing... (${wallet.address}, ${amount}, ${ticket.address}, ${AddressZero})`);

    await prizePool.depositTo(wallet.address, amount, this.overrides);

    debug(`Bought tickets`);
  };

  this.buyTicketsForPrizeDistributor = async function ({ user, tickets, prizeDistributor }) {
    debug(`Buying tickets...`);
    const owner = await this.wallet(0);
    let wallet = await this.wallet(user);

    debug("wallet is ", wallet.address);
    let token = await this.token(wallet);
    let ticket = await this.ticket(wallet);
    let prizePool = await this.prizePool(wallet);

    let amount = toWei(tickets);

    let balance = await token.balanceOf(wallet.address);
    if (balance.lt(amount)) {
      await token.mint(wallet.address, amount, this.overrides);
    }

    await token.approve(prizePool.address, amount, this.overrides);

    debug(`Depositing... (${wallet.address}, ${amount}, ${ticket.address}, ${AddressZero})`);

    await prizePool.depositTo(wallet.address, amount, this.overrides);

    debug(`Bought tickets`);
    ticket.transfer(prizeDistributor, amount);

    debug(`Transfer tickets to prizeDistributor`);
  };

  this.expectUserToHaveTickets = async function ({ user, tickets }) {
    let wallet = await this.wallet(user);
    let ticket = await this.ticket(wallet);
    let amount = toWei(tickets);
    expect(await ticket.balanceOf(wallet.address)).to.equalish(amount, "100000000000000000000");
  };

  this.expectUserToHaveTokens = async function ({ user, tokens }) {
    const wallet = await this.wallet(user);
    const token = await this.token(wallet);
    const amount = toWei(tokens);
    const balance = await token.balanceOf(wallet.address);
    debug(`expectUserToHaveTokens: ${balance.toString()}`);
    expect(balance).to.equal(amount);
  };

  this.claim = async function ({ user, drawId, picks }) {
    const wallet = await this.wallet(user);
    const prizeDistributor = await this.prizeDistributor(wallet);
    const encoder = ethers.utils.defaultAbiCoder;
    const pickIndices = encoder.encode(["uint256[][]"], [[picks]]);
    await prizeDistributor.claim(wallet.address, [drawId], pickIndices);
  };

  this.withdraw = async function ({ user, tickets }) {
    debug(`withdraw: user ${user}, tickets: ${tickets}`);
    let wallet = await this.wallet(user);
    let ticket = await this.ticket(wallet);
    let withdrawalAmount;

    if (!tickets) {
      withdrawalAmount = await ticket.balanceOf(wallet.address);
    } else {
      withdrawalAmount = toWei(tickets);
    }

    debug(`Withdrawing ${withdrawalAmount}...`);
    let prizePool = await this.prizePool(wallet);

    await prizePool.connect(await this.wallet(0)).setDrawBeacon((await this.drawBeacon()).address);
    await prizePool.withdrawFrom(wallet.address, withdrawalAmount);

    debug("done withdraw");
  };

  this.draw = async function () {
    const drawBeacon = await this.drawBeacon();
    const remainingTime = (await drawBeacon.beaconPeriodRemainingSeconds()).toNumber();
    await ethers.provider.send("evm_increaseTime", [remainingTime]);
    await drawBeacon.startDraw();
  };

  this.pushPrizeDistribution = async function ({ drawId, startTimestampOffset, endTimestampOffset, numberOfPicks }) {
    const prizeDistributionBuffer = await this.prizeDistributionBuffer();

    const prizeDistributions = {
      startTimestampOffset,
      endTimestampOffset,
      numberOfPicks,
    };

    await prizeDistributionBuffer.pushPrizeDistribution(drawId, prizeDistributions);
  };
}

module.exports = {
  PoolEnv,
};
