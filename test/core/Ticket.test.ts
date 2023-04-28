import { getFirstLidoRebaseTimestamp } from "../../scripts/helpers/getFirstLidoRebaseTimestamp";

import { increaseTime as increaseTimeHelper } from "./helpers/increaseTime";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { utils, Contract, ContractFactory, BigNumber } from "ethers";

import { delegateSignature } from "./helpers/delegateSignature";

import hardhat, { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const newDebug = require("debug");

const debug = newDebug("pt:Ticket.test.ts");

const { getContractFactory, constants, getSigners, provider } = ethers;
const { parseEther: toWei } = utils;
const { AddressZero } = constants;
const { getBlock } = provider;

const increaseTime = (time: number) => increaseTimeHelper(provider, time);
const toBN = (num: any) => BigNumber.from(num);

async function deployTicketContract(
  ticketName: string,
  ticketSymbol: string,
  decimals: number,
  controllerAddress: string
): Promise<Contract> {
  const ticketFactory: ContractFactory = await ethers.getContractFactory("TicketHarness");

  return await upgrades.deployProxy(ticketFactory, [ticketName, ticketSymbol, decimals, controllerAddress]);
}

async function printTwabs(ticketContract: Contract, wallet: SignerWithAddress, debugLog: any = debug): Promise<any[]> {
  const context: any = await ticketContract.getAccountDetails(wallet.address);

  debugLog(
    `Twab Context for ${wallet.address}: { balance: ${ethers.utils.formatEther(context.balance)}, nextTwabIndex: ${
      context.nextTwabIndex
    }, cardinality: ${context.cardinality}}`
  );

  const twabs: any[] = [];

  for (let i: number = 0; i < context.cardinality; ++i) {
    twabs.push(await ticketContract.getTwab(wallet.address, i));
  }

  twabs.forEach((twab: any, index: number) => {
    debugLog(`Twab ${index} { amount: ${twab.amount}, timestamp: ${twab.timestamp}}`);
  });

  return twabs;
}

describe("Ticket", () => {
  let PrizePoolHarness: ContractFactory;
  let ASX: ContractFactory;

  let prizePool: Contract;
  let ticket: Contract;
  let asx: Contract;

  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;
  let wallet4: SignerWithAddress;
  let wallet5: SignerWithAddress;

  const ticketName: string = "Pool Share Token";
  const ticketSymbol: string = "PST";
  const ticketDecimals: number = 18;

  beforeEach(async () => {
    await hardhat.network.provider.send("hardhat_reset");

    [wallet1, wallet2, wallet3, wallet4, wallet5] = await getSigners();

    ASX = await getContractFactory("ASX");
    asx = await upgrades.deployProxy(
      ASX,
      ["Asymetrix Governance Token", "ASX", ethers.utils.parseEther("100000000"), wallet1.address],
      { initializer: "initialize" }
    );

    PrizePoolHarness = await getContractFactory("PrizePoolHarness", wallet1);
    prizePool = await upgrades.deployProxy(PrizePoolHarness, [
      wallet1.address,
      wallet1.address,
      asx.address,
      BigNumber.from(ethers.utils.parseEther("10000000")),
      BigNumber.from("604800"),
      BigNumber.from("86400"),
      BigNumber.from("14400"), // 4 hours
      getFirstLidoRebaseTimestamp(),
      BigNumber.from("500"), // 5.00%
    ]);

    ticket = await deployTicketContract(ticketName, ticketSymbol, ticketDecimals, prizePool.address);

    await prizePool.setTicket(ticket.address);

    // Delegate for each of the users
    await ticket.connect(wallet1).delegate(wallet1.address);
    await ticket.connect(wallet2).delegate(wallet2.address);
    await ticket.connect(wallet3).delegate(wallet3.address);
    await ticket.connect(wallet4).delegate(wallet4.address);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(
        ticket.connect(wallet1).initialize(ticketName, ticketSymbol, ticketDecimals, prizePool.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        ticket
          .connect(wallet1)
          .testOnlyInitializingModifier(ticketName, ticketSymbol, ticketDecimals, prizePool.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should initialize ticket", async () => {
      const ticket: Contract = await deployTicketContract(ticketName, ticketSymbol, ticketDecimals, prizePool.address);

      expect(await ticket.connect(wallet1).name()).to.equal(ticketName);
      expect(await ticket.connect(wallet1).symbol()).to.equal(ticketSymbol);
      expect(await ticket.connect(wallet1).decimals()).to.equal(ticketDecimals);
      expect(await ticket.connect(wallet1).controller()).to.equal(prizePool.address);
    });

    it("should fail if token decimal is not greater than 0", async () => {
      await expect(deployTicketContract(ticketName, ticketSymbol, 0, prizePool.address)).to.be.revertedWith(
        "ControlledToken/decimals-gt-zero"
      );
    });

    it("should fail if controller address is address 0", async () => {
      await expect(
        deployTicketContract(ticketName, ticketSymbol, ticketDecimals, constants.AddressZero)
      ).to.be.revertedWith("ControlledToken/controller-not-zero-address");
    });
  });

  describe("decimals()", () => {
    it("should return default decimals", async () => {
      expect(await ticket.connect(wallet1).decimals()).to.equal(18);
    });
  });

  describe("balanceOf()", () => {
    it("should return user balance", async () => {
      const mintBalance: BigNumber = toWei("1000");

      await ticket.connect(wallet1).mint(wallet1.address, mintBalance);

      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(mintBalance);
    });
  });

  describe("totalSupply()", () => {
    it("should return total supply of tickets", async () => {
      const mintBalance: BigNumber = toWei("1000");

      await ticket.connect(wallet1).mint(wallet1.address, mintBalance);
      await ticket.connect(wallet1).mint(wallet2.address, mintBalance);

      expect(await ticket.connect(wallet1).totalSupply()).to.equal(mintBalance.mul(2));
    });
  });

  describe("flash loan attack", () => {
    let flashTimestamp: number;
    let mintTimestamp: number;

    beforeEach(async () => {
      await ticket.connect(wallet1).flashLoan(wallet1.address, toWei("100000"));

      flashTimestamp = (await provider.getBlock("latest")).timestamp;

      await increaseTime(10);

      await ticket.connect(wallet1).mint(wallet1.address, toWei("100"));

      mintTimestamp = (await provider.getBlock("latest")).timestamp;

      await increaseTime(20);
    });

    it("should not affect getBalanceAt()", async () => {
      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, flashTimestamp - 1)).to.equal(0);
      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, flashTimestamp)).to.equal(0);
      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, flashTimestamp + 1)).to.equal(0);
    });

    it("should not affect getAverageBalanceBetween() for that time", async () => {
      expect(
        await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, flashTimestamp - 1, flashTimestamp + 1)
      ).to.equal(0);
    });

    it("should not affect subsequent twabs for getAverageBalanceBetween()", async () => {
      expect(
        await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, mintTimestamp - 11, mintTimestamp + 11)
      ).to.equal(toWei("50"));
    });
  });

  describe("_transfer()", () => {
    const mintAmount: BigNumber = toWei("2500");
    const transferAmount: BigNumber = toWei("1000");

    beforeEach(async () => {
      await ticket.connect(wallet1).mint(wallet1.address, mintAmount);
    });

    it("should transfer tickets from sender to recipient", async () => {
      expect(await ticket.connect(wallet1).transferTo(wallet1.address, wallet2.address, transferAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(wallet1.address, wallet2.address, transferAmount);

      await increaseTime(10);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet2.address, (await getBlock("latest")).timestamp)
      ).to.equal(transferAmount);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount.sub(transferAmount));
    });

    it("should transferFrom tickets and delegate from sender to new users", async () => {
      await ticket.connect(wallet1).approve(wallet2.address, toWei("5000"));

      expect(await ticket.connect(wallet2).transferFrom(wallet1.address, wallet5.address, transferAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(wallet1.address, wallet5.address, transferAmount);

      await increaseTime(10);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet5.address, (await getBlock("latest")).timestamp)
      ).to.equal(transferAmount);
      expect(await ticket.connect(wallet1).balanceOf(wallet5.address)).to.equal(transferAmount);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount.sub(transferAmount));
      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(mintAmount.sub(transferAmount));
    });

    it("should transfer tickets and delegate from sender to new users", async () => {
      expect(await ticket.connect(wallet1).transfer(wallet5.address, transferAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(wallet1.address, wallet5.address, transferAmount);

      await increaseTime(10);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet5.address, (await getBlock("latest")).timestamp)
      ).to.equal(transferAmount);
      expect(await ticket.connect(wallet1).balanceOf(wallet5.address)).to.equal(transferAmount);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount.sub(transferAmount));
      expect(await ticket.connect(wallet1).balanceOf(wallet1.address)).to.equal(mintAmount.sub(transferAmount));
    });

    it("should not perform any transfer if sender and recipient are the same", async () => {
      expect(await ticket.connect(wallet1).transferTo(wallet1.address, wallet1.address, transferAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(wallet1.address, wallet1.address, transferAmount);

      await increaseTime(10);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount);
    });

    it("should update delegate balance", async () => {
      await ticket.connect(wallet1).delegate(wallet3.address);
      await ticket.connect(wallet1).connect(wallet2).delegate(wallet4.address);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(toWei("0"));

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet2.address, (await getBlock("latest")).timestamp)
      ).to.equal(toWei("0"));

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet3.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet4.address, (await getBlock("latest")).timestamp)
      ).to.equal(toWei("0"));

      expect(await ticket.connect(wallet1).transferTo(wallet1.address, wallet2.address, transferAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(wallet1.address, wallet2.address, transferAmount);

      await increaseTime(10);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(toWei("0"));

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet2.address, (await getBlock("latest")).timestamp)
      ).to.equal(toWei("0"));

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet3.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount.sub(transferAmount));

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet4.address, (await getBlock("latest")).timestamp)
      ).to.equal(transferAmount);
    });

    it("should fail to transfer tickets if sender address is address zero", async () => {
      await expect(ticket.connect(wallet1).transferTo(AddressZero, wallet2.address, transferAmount)).to.be.revertedWith(
        "ERC20: transfer from the zero address"
      );
    });

    it("should fail to transfer tickets if receiver address is address zero", async () => {
      await expect(ticket.connect(wallet1).transferTo(wallet1.address, AddressZero, transferAmount)).to.be.revertedWith(
        "ERC20: transfer to the zero address"
      );
    });

    it("should fail to transfer tickets if transfer amount exceeds sender balance", async () => {
      const insufficientMintAmount: BigNumber = toWei("5000");

      await expect(
        ticket.connect(wallet1).transferTo(wallet1.address, wallet2.address, insufficientMintAmount)
      ).to.be.revertedWith("Ticket/twab-burn-lt-balance");
    });
  });

  describe("_mint()", () => {
    const debug: any = newDebug("pt:Ticket.test.ts:_mint()");
    const mintAmount: BigNumber = toWei("1000");

    it("should mint tickets to user", async () => {
      expect(await ticket.connect(wallet1).mint(wallet1.address, mintAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(AddressZero, wallet1.address, mintAmount);

      await increaseTime(10);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount);

      expect(await ticket.connect(wallet1).totalSupply()).to.equal(mintAmount);
    });

    it("should update delegate balance", async () => {
      await ticket.connect(wallet1).delegate(wallet2.address);

      expect(await ticket.connect(wallet1).mint(wallet1.address, mintAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(AddressZero, wallet1.address, mintAmount);

      await increaseTime(10);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(toWei("0"));

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet2.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount);

      expect(await ticket.connect(wallet1).totalSupply()).to.equal(mintAmount);
    });

    it("should fail to mint tickets if user address is address zero", async () => {
      await expect(ticket.connect(wallet1).mint(AddressZero, mintAmount)).to.be.revertedWith(
        "ERC20: mint to the zero address"
      );
    });

    it("should not record additional twabs when minting twice in the same block", async () => {
      expect(await ticket.connect(wallet1).mintTwice(wallet1.address, mintAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(AddressZero, wallet1.address, mintAmount);

      const timestamp: number = (await getBlock("latest")).timestamp;
      const twabs: any[] = await printTwabs(ticket, wallet1, debug);
      const matchingTwabs: any[] = twabs.reduce((all: any, twab: any) => {
        debug(`TWAB timestamp ${twab.timestamp}, timestamp: ${timestamp}`);
        debug(twab);

        if (twab.timestamp.toString() == timestamp.toString()) {
          all.push(twab);
        }

        return all;
      }, []);

      expect(matchingTwabs.length).to.equal(1);
      expect(await ticket.connect(wallet1).totalSupply()).to.equal(mintAmount.mul(2));
    });
  });

  describe("_burn()", () => {
    const burnAmount: BigNumber = toWei("500");
    const mintAmount: BigNumber = toWei("1500");

    it("should burn tickets from user balance", async () => {
      await ticket.connect(wallet1).mint(wallet1.address, mintAmount);

      expect(await ticket.connect(wallet1).burn(wallet1.address, burnAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(wallet1.address, AddressZero, burnAmount);

      await increaseTime(1);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount.sub(burnAmount));

      expect(await ticket.connect(wallet1).totalSupply()).to.equal(mintAmount.sub(burnAmount));
    });

    it("should update delegate balance", async () => {
      await ticket.connect(wallet1).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet1.address, mintAmount);

      expect(await ticket.connect(wallet1).burn(wallet1.address, burnAmount))
        .to.emit(ticket, "Transfer")
        .withArgs(wallet1.address, AddressZero, burnAmount);

      await increaseTime(1);

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet1.address, (await getBlock("latest")).timestamp)
      ).to.equal(toWei("0"));

      expect(
        await ticket.connect(wallet1).getBalanceAt(wallet2.address, (await getBlock("latest")).timestamp)
      ).to.equal(mintAmount.sub(burnAmount));

      expect(await ticket.connect(wallet1).totalSupply()).to.equal(mintAmount.sub(burnAmount));
    });

    it("should fail to burn tickets from user balance if user address is address zero", async () => {
      await expect(ticket.connect(wallet1).burn(AddressZero, mintAmount)).to.be.revertedWith(
        "ERC20: burn from the zero address"
      );
    });

    it("should fail to burn tickets from user balance if burn amount exceeds user balance", async () => {
      const insufficientMintAmount: BigNumber = toWei("250");

      await ticket.connect(wallet1).mint(wallet1.address, insufficientMintAmount);
      await ticket.connect(wallet1).mint(wallet2.address, mintAmount);

      await expect(ticket.connect(wallet1).burn(wallet1.address, mintAmount)).to.be.revertedWith(
        "Ticket/twab-burn-lt-balance"
      );
    });
  });

  describe("getAverageTotalSupplyBetween()", () => {
    const balanceBefore: BigNumber = toWei("100");
    let timestamp: number;

    beforeEach(async () => {
      await ticket.connect(wallet1).mint(wallet1.address, balanceBefore);

      timestamp = (await getBlock("latest")).timestamp;

      debug(`minted ${ethers.utils.formatEther(balanceBefore)} @ timestamp ${timestamp}`);
    });

    it("should revert on unequal lenght inputs", async () => {
      const drawStartTimestamp: number = timestamp;
      const drawEndTimestamp: number = timestamp;

      await expect(
        ticket
          .connect(wallet1)
          .getAverageBalancesBetween(wallet1.address, [drawStartTimestamp, drawStartTimestamp], [drawEndTimestamp])
      ).to.be.revertedWith("Ticket/start-end-times-length-match");
    });

    it("should fail if timestamps length is wrong", async () => {
      await expect(
        ticket
          .connect(wallet1)
          .getAverageBalancesBetween(wallet1.address, Array(10_000 + 1).fill(100), Array(10_000 + 1).fill(100))
      ).to.be.revertedWith("Ticket/wrong-array-length");
    });

    it("should return an average of zero for pre-history requests", async () => {
      const drawStartTimestamp: number = timestamp - 100;
      const drawEndTimestamp: number = timestamp - 50;

      const result: any[] = await ticket
        .connect(wallet1)
        .getAverageTotalSuppliesBetween([drawStartTimestamp], [drawEndTimestamp]);

      result.forEach((res: any) => {
        expect(res).to.deep.equal(toWei("0"));
      });
    });

    it("should not project into the future", async () => {
      // At this time the user has held 1000 tokens for zero seconds
      const drawStartTimestamp: number = timestamp - 50;
      const drawEndTimestamp: number = timestamp + 50;

      const result: any[] = await ticket
        .connect(wallet1)
        .getAverageTotalSuppliesBetween([drawStartTimestamp], [drawEndTimestamp]);

      result.forEach((res: any) => {
        expect(res).to.deep.equal(toWei("0"));
      });
    });

    it("should return half the minted balance when the duration is centered over first twab", async () => {
      await increaseTime(100);

      const drawStartTimestamp: number = timestamp - 50;
      const drawEndTimestamp: number = timestamp + 50;

      const result: any[] = await ticket
        .connect(wallet1)
        .getAverageTotalSuppliesBetween([drawStartTimestamp], [drawEndTimestamp]);

      result.forEach((res: any) => {
        expect(res).to.deep.equal(toWei("50"));
      });
    });

    it("should return the minted balance divided by 4", async () => {
      await ticket.connect(wallet1).mint(wallet2.address, balanceBefore);

      timestamp = (await getBlock("latest")).timestamp;

      const fourthTime: number = 1000000 / 4;

      await increaseTime(fourthTime);

      await ticket.connect(wallet1).burn(wallet1.address, balanceBefore);

      await increaseTime(fourthTime);

      await ticket.connect(wallet1).mint(wallet1.address, toWei("50"));

      await increaseTime(fourthTime);

      await ticket.connect(wallet1).mint(wallet1.address, toWei("10"));

      await increaseTime(fourthTime);

      const newTimestamp: number = (await getBlock("latest")).timestamp;
      const drawStartTimestamp: number = timestamp;
      const drawEndTimestamp: number = newTimestamp;

      const resultUser1: any[] = await ticket
        .connect(wallet1)
        .getAverageBalanceBetween(wallet1.address, drawStartTimestamp, drawEndTimestamp);
      const resultUser2: any[] = await ticket
        .connect(wallet1)
        .getAverageBalanceBetween(wallet2.address, drawStartTimestamp, drawEndTimestamp);
      const resultTotalSupply: any[] = await ticket
        .connect(wallet1)
        .getAverageTotalSuppliesBetween([drawStartTimestamp], [drawEndTimestamp]);

      expect("52.50").to.equal(parseFloat(ethers.utils.formatEther(resultUser1)).toFixed(2));
      expect(toWei("100")).to.equal(resultUser2);

      const expectedTotalSupply: BigNumber = toBN(resultUser1).add(toBN(resultUser2));

      expect(expectedTotalSupply.toString()).to.equal(resultTotalSupply.toString());
    });

    it("should return the minted balance divided by 3", async () => {
      await ticket.connect(wallet1).mint(wallet2.address, balanceBefore);

      timestamp = (await getBlock("latest")).timestamp;

      const thirdOfWeek: number = 604800 / 3; // 201.600s

      await increaseTime(thirdOfWeek);

      await ticket.connect(wallet1).burn(wallet1.address, balanceBefore);

      await increaseTime(thirdOfWeek);

      await ticket.connect(wallet1).mint(wallet1.address, balanceBefore);

      await increaseTime(thirdOfWeek);

      const newTimestamp: number = (await getBlock("latest")).timestamp;
      const drawStartTimestamp: number = timestamp;
      const drawEndTimestamp: number = newTimestamp;
      const resultUser1: any = await ticket
        .connect(wallet1)
        .getAverageBalanceBetween(wallet1.address, drawStartTimestamp, drawEndTimestamp);
      const resultUser2: any = await ticket
        .connect(wallet1)
        .getAverageBalanceBetween(wallet2.address, drawStartTimestamp, drawEndTimestamp);
      const resultTotalSupply: any = await ticket
        .connect(wallet1)
        .getAverageTotalSuppliesBetween([drawStartTimestamp], [drawEndTimestamp]);
      const expectedTotalSupply: BigNumber = toBN(resultUser1).add(toBN(resultUser2));

      expect(expectedTotalSupply.toString()).to.equal(resultTotalSupply.toString());
    });

    it("should return an accurate average when the range is after the last twab", async () => {
      await increaseTime(100);

      const drawStartTimestamp: number = timestamp + 50;
      const drawEndTimestamp: number = timestamp + 51;

      const result: any[] = await ticket
        .connect(wallet1)
        .getAverageTotalSuppliesBetween([drawStartTimestamp], [drawEndTimestamp]);

      expect(toWei("100").toString()).to.equal(result[0].toString());
    });
  });

  describe("getAverageBalanceBetween()", () => {
    const debug: any = newDebug("pt:Ticket.test.ts:getAverageBalanceBetween()");
    const balanceBefore: BigNumber = toWei("1000");
    let timestamp: number;

    beforeEach(async () => {
      await ticket.connect(wallet1).mint(wallet1.address, balanceBefore);

      timestamp = (await getBlock("latest")).timestamp;

      debug(`minted ${ethers.utils.formatEther(balanceBefore)} @ timestamp ${timestamp}`);
    });

    it("should return an average of zero for pre-history requests", async () => {
      await printTwabs(ticket, wallet1, debug);

      expect(
        await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp - 100, timestamp - 50)
      ).to.equal(toWei("0"));
    });

    it("should not project into the future", async () => {
      // At this time the user has held 1000 tokens for zero seconds
      expect(
        await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp - 50, timestamp + 50)
      ).to.equal(toWei("0"));
    });

    it("should return half the minted balance when the duration is centered over first twab", async () => {
      await increaseTime(100);

      expect(
        await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp - 50, timestamp + 50)
      ).to.equal(toWei("500"));
    });

    it("should return an accurate average when the range is after the last twab", async () => {
      await increaseTime(100);

      expect(
        await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp + 50, timestamp + 51)
      ).to.equal(toWei("1000"));
    });

    context("with two twabs", () => {
      const transferAmount: BigNumber = toWei("500");
      let timestamp2: number;

      beforeEach(async () => {
        // They've held 1000 for t+100 seconds
        await increaseTime(100);

        debug(`Transferring ${ethers.utils.formatEther(transferAmount)}...`);

        // Now transfer out 500
        await ticket.connect(wallet1).transfer(wallet2.address, transferAmount);

        timestamp2 = (await getBlock("latest")).timestamp;

        debug(`Transferred at time ${timestamp2}`);

        // They've held 500 for t+100+100 seconds
        await increaseTime(100);
      });

      it("should return an average of zero for pre-history requests", async () => {
        await ticket.connect(wallet1).getAverageBalanceTx(wallet1.address, timestamp - 100, timestamp - 50);

        debug(`Test getAverageBalance() : ${timestamp - 100}, ${timestamp - 50}`);

        expect(
          await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp - 100, timestamp - 50)
        ).to.equal(toWei("0"));
      });

      it("should return half the minted balance when the duration is centered over first twab", async () => {
        await printTwabs(ticket, wallet1, debug);

        debug(`Test getAverageBalance() : ${timestamp - 50}, ${timestamp + 50}`);

        expect(
          await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp - 50, timestamp + 50)
        ).to.equal(toWei("500"));
      });

      it("should return an accurate average when the range is between twabs", async () => {
        await ticket.connect(wallet1).getAverageBalanceTx(wallet1.address, timestamp + 50, timestamp + 55);

        debug(`Test getAverageBalance() : ${timestamp + 50}, ${timestamp + 55}`);

        expect(
          await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp + 50, timestamp + 55)
        ).to.equal(toWei("1000"));
      });

      it("should return an accurate average when the end is after the last twab", async () => {
        debug(`Test getAverageBalance() : ${timestamp2 - 50}, ${timestamp2 + 50}`);

        expect(
          await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp2 - 50, timestamp2 + 50)
        ).to.equal(toWei("750"));
      });

      it("should return an accurate average when the range is after twabs", async () => {
        debug(`Test getAverageBalance() : ${timestamp2 + 50}, ${timestamp2 + 51}`);

        expect(
          await ticket.connect(wallet1).getAverageBalanceBetween(wallet1.address, timestamp2 + 50, timestamp2 + 51)
        ).to.equal(toWei("500"));
      });
    });
  });

  describe("getAverageBalancesBetween()", () => {
    const debug: any = newDebug("pt:Ticket.test.ts:getAverageBalancesBetween()");
    const balanceBefore: BigNumber = toWei("1000");
    let timestamp: number;

    beforeEach(async () => {
      await ticket.connect(wallet1).mint(wallet1.address, balanceBefore);

      timestamp = (await getBlock("latest")).timestamp;

      debug(`minted ${ethers.utils.formatEther(balanceBefore)} @ timestamp ${timestamp}`);
    });

    it("should revert on unequal lenght inputs", async () => {
      const drawStartTimestamp: number = timestamp;
      const drawEndTimestamp: number = timestamp;

      await expect(
        ticket
          .connect(wallet1)
          .getAverageBalancesBetween(wallet1.address, [drawStartTimestamp, drawStartTimestamp], [drawEndTimestamp])
      ).to.be.revertedWith("Ticket/start-end-times-length-match");
    });

    it("should return an average of zero for pre-history requests", async () => {
      const drawStartTimestamp: number = timestamp - 100;
      const drawEndTimestamp: number = timestamp - 50;

      const result: any[] = await ticket
        .connect(wallet1)
        .getAverageBalancesBetween(
          wallet1.address,
          [drawStartTimestamp, drawStartTimestamp - 50],
          [drawEndTimestamp, drawEndTimestamp - 50]
        );

      result.forEach((res: any) => {
        expect(res).to.deep.equal(toWei("0"));
      });
    });

    it("should return half the minted balance when the duration is centered over first twab, and zero from before", async () => {
      await increaseTime(100);

      const drawStartTimestamp0: number = timestamp - 100;
      const drawEndTimestamp0: number = timestamp - 50;
      const drawStartTimestamp: number = timestamp - 50;
      const drawEndTimestamp: number = timestamp + 50;

      const result: any[] = await ticket
        .connect(wallet1)
        .getAverageBalancesBetween(
          wallet1.address,
          [drawStartTimestamp, drawStartTimestamp0],
          [drawEndTimestamp, drawEndTimestamp0]
        );

      expect(result[0]).to.deep.equal(toWei("500"));
      expect(result[1]).to.deep.equal(toWei("0"));
    });
  });

  describe("getBalance()", () => {
    const balanceBefore: BigNumber = toWei("1000");

    beforeEach(async () => {
      await ticket.connect(wallet1).mint(wallet1.address, balanceBefore);
    });

    it("should get correct balance after a ticket transfer", async () => {
      const transferAmount: BigNumber = toWei("500");

      await increaseTime(60);

      const timestampBefore: number = (await getBlock("latest")).timestamp;

      await ticket.connect(wallet1).transfer(wallet2.address, transferAmount);

      // No-op register for gas usage
      await ticket.connect(wallet1).getBalanceTx(wallet1.address, timestampBefore);

      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, timestampBefore)).to.equal(balanceBefore);

      const timestampAfter: number = (await getBlock("latest")).timestamp;

      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, timestampAfter)).to.equal(
        balanceBefore.sub(transferAmount)
      );
    });
  });

  describe("getBalancesAt()", () => {
    it("should get user balances", async () => {
      const mintAmount: BigNumber = toWei("2000");
      const transferAmount: BigNumber = toWei("500");

      await ticket.connect(wallet1).mint(wallet1.address, mintAmount);

      const mintTimestamp: number = (await getBlock("latest")).timestamp;

      await increaseTime(10);

      await ticket.connect(wallet1).transfer(wallet2.address, transferAmount);

      const transferTimestamp: number = (await getBlock("latest")).timestamp;

      await increaseTime(10);

      const balances: BigNumber[] = await ticket
        .connect(wallet1)
        .getBalancesAt(wallet1.address, [mintTimestamp - 1, mintTimestamp, mintTimestamp + 1, transferTimestamp + 2]);

      expect(balances[0]).to.equal("0");

      // End of block balance is mint amount
      expect(balances[1]).to.equal(mintAmount);
      expect(balances[2]).to.equal(mintAmount);
      expect(balances[3]).to.equal(mintAmount.sub(transferAmount));
    });

    it("should fail if timestamps length is wrong", async () => {
      await expect(
        ticket.connect(wallet1).getBalancesAt(wallet1.address, Array(10_000 + 1).fill(100))
      ).to.be.revertedWith("Ticket/wrong-array-length");
    });
  });

  describe("getTotalSupplyAt()", () => {
    const debug: any = newDebug("pt:Ticket.test.ts:getTotalSupplyAt()");

    context("after a mint", () => {
      const mintAmount: BigNumber = toWei("1000");
      let timestamp: number;

      beforeEach(async () => {
        await ticket.connect(wallet1).mint(wallet1.address, mintAmount);

        timestamp = (await getBlock("latest")).timestamp;
      });

      it("should return 0 before the mint", async () => {
        expect(await ticket.connect(wallet1).getTotalSupplyAt(timestamp - 50)).to.equal(0);
      });

      it("should return 0 at the time of the mint", async () => {
        expect(await ticket.connect(wallet1).getTotalSupplyAt(timestamp)).to.equal(mintAmount);
      });

      it("should return the value after the timestamp", async () => {
        const twab: any = await ticket.connect(wallet1).getTwab(wallet1.address, 0);

        debug(`twab: `, twab);
        debug(`Checking time ${timestamp + 1}`);

        await increaseTime(10);

        expect(await ticket.connect(wallet1).getTotalSupplyAt(timestamp + 1)).to.equal(mintAmount);
      });
    });
  });

  describe("getTotalSuppliesAt()", () => {
    const debug: any = newDebug("pt:Ticket.test.ts:getTotalSuppliesAt()");

    it("should decrease total supply twab", async () => {
      await ticket.connect(wallet1).testDecreaseTotalSupplyTwab();
    });

    it("should get ticket total supplies", async () => {
      const mintAmount: BigNumber = toWei("2000");
      const burnAmount: BigNumber = toWei("500");

      await ticket.connect(wallet1).mint(wallet1.address, mintAmount);

      const mintTimestamp: number = (await getBlock("latest")).timestamp;

      debug(`mintTimestamp: ${mintTimestamp}`);

      await increaseTime(10);

      await ticket.connect(wallet1).burn(wallet1.address, burnAmount);

      const burnTimestamp: number = (await getBlock("latest")).timestamp;

      debug(`burnTimestamp: ${burnTimestamp}`);

      const totalSupplies: BigNumber[] = await ticket
        .connect(wallet1)
        .getTotalSuppliesAt([mintTimestamp - 1, mintTimestamp, mintTimestamp + 1, burnTimestamp + 1]);

      debug(`Total supplies: ${totalSupplies.map((ts: any) => ethers.utils.formatEther(ts))}`);

      expect(totalSupplies[0]).to.equal(toWei("0"));
      expect(totalSupplies[1]).to.equal(mintAmount);
      expect(totalSupplies[2]).to.equal(mintAmount);
      expect(totalSupplies[3]).to.equal(mintAmount.sub(burnAmount));
    });

    it("should fail if timestamps length is wrong", async () => {
      await expect(ticket.connect(wallet1).getTotalSuppliesAt(Array(10_000 + 1).fill(100))).to.be.revertedWith(
        "Ticket/wrong-array-length"
      );
    });
  });

  describe("delegate()", () => {
    const debug: any = newDebug("pt:Ticket.test.ts:delegate()");

    it("should allow a user to delegate to another", async () => {
      await ticket.connect(wallet1).mint(wallet1.address, toWei("100"));

      await expect(ticket.connect(wallet1).delegate(wallet2.address))
        .to.emit(ticket, "Delegated")
        .withArgs(wallet1.address, wallet2.address);

      const timestamp: number = (await provider.getBlock("latest")).timestamp;

      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet2.address);
      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, timestamp)).to.equal(toWei("0"));
      expect(await ticket.connect(wallet1).getBalanceAt(wallet2.address, timestamp)).to.equal(toWei("100"));
    });

    it("should be a no-op if delegate address has already been set to passed address", async () => {
      await ticket.connect(wallet1).mint(wallet1.address, toWei("100"));
      await ticket.connect(wallet1).delegate(wallet2.address);

      await expect(ticket.connect(wallet1).delegate(wallet2.address)).to.not.emit(ticket, "Delegated");
    });

    it("should allow the delegate to be reset by passing zero", async () => {
      await ticket.connect(wallet1).mint(wallet1.address, toWei("100"));
      await ticket.connect(wallet1).delegate(wallet2.address);

      const beforeTimestamp: number = (await provider.getBlock("latest")).timestamp;

      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet2.address);
      expect(await ticket.connect(wallet1).getBalanceAt(wallet2.address, beforeTimestamp)).to.equal(toWei("100"));

      await ticket.connect(wallet1).delegate(AddressZero);

      const afterTimestamp: number = (await provider.getBlock("latest")).timestamp;

      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(AddressZero);
      expect(await ticket.connect(wallet1).getBalanceAt(wallet2.address, afterTimestamp)).to.equal(toWei("0"));
      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, afterTimestamp)).to.equal(toWei("0"));
    });

    it("should clear old delegates if any", async () => {
      await ticket.connect(wallet1).mint(wallet1.address, toWei("100"));

      const mintTimestamp: number = (await provider.getBlock("latest")).timestamp;

      debug(`mintTimestamp: ${mintTimestamp}`);

      await ticket.connect(wallet1).delegate(wallet2.address);

      const delegateTimestamp: number = (await provider.getBlock("latest")).timestamp;

      debug(`delegateTimestamp: ${delegateTimestamp}`);

      await ticket.connect(wallet1).delegate(wallet3.address);

      const secondTimestamp: number = (await provider.getBlock("latest")).timestamp;

      debug(`secondTimestamp: ${secondTimestamp}`);

      debug(`WALLET 2: ${wallet2.address}`);

      await printTwabs(ticket, wallet2, debug);

      debug(`WALLET 3: ${wallet3.address}`);

      await printTwabs(ticket, wallet3, debug);

      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, delegateTimestamp)).to.equal(toWei("0"));

      expect(await ticket.connect(wallet1).getBalanceAt(wallet2.address, mintTimestamp)).to.equal("0");

      // Balance at the end of the block was zero
      expect(await ticket.connect(wallet1).getBalanceAt(wallet2.address, delegateTimestamp)).to.equal(toWei("100"));

      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet3.address);
      expect(await ticket.connect(wallet1).getBalanceAt(wallet1.address, secondTimestamp)).to.equal(toWei("0"));

      expect(await ticket.connect(wallet1).getBalanceAt(wallet2.address, secondTimestamp)).to.equal(toWei("0"));

      expect(await ticket.connect(wallet1).getBalanceAt(wallet3.address, secondTimestamp)).to.equal(toWei("100"));
    });
  });

  describe("delegateWithSignature()", () => {
    it("should fail if deadline is expired", async () => {
      const { user, delegate, v, r, s }: any = await delegateSignature({
        ticket,
        userWallet: wallet1,
        delegate: wallet2.address,
      });

      await expect(ticket.connect(wallet3).delegateWithSignature(user, delegate, 0, v, r, s)).to.be.revertedWith(
        "Ticket/delegate-expired-deadline"
      );
    });

    it("should allow somone to delegate with a signature", async () => {
      const { user, delegate, deadline, v, r, s }: any = await delegateSignature({
        ticket,
        userWallet: wallet1,
        delegate: wallet2.address,
      });

      await ticket.connect(wallet3).delegateWithSignature(user, delegate, deadline, v, r, s);

      expect(await ticket.connect(wallet1).delegateOf(wallet1.address)).to.equal(wallet2.address);
    });

    it("should fail if a signature is invalid", async () => {
      let { user, delegate, deadline, v, r }: any = await delegateSignature({
        ticket,
        userWallet: wallet1,
        delegate: wallet2.address,
      });

      await expect(
        ticket
          .connect(wallet3)
          .delegateWithSignature(
            user,
            delegate,
            deadline,
            v,
            r,
            "0x02b92c626376d43abbf9557cf0bf73cdb259290d613ef6e279842e80bbbcd8c7"
          )
      ).to.be.revertedWith("Ticket/delegate-invalid-signature");
    });
  });

  describe("controllerDelegateFor", () => {
    it("should not allow anyone else to delegate", async () => {
      await expect(ticket.connect(wallet2).controllerDelegateFor(wallet1.address, wallet3.address)).to.be.revertedWith(
        "ControlledToken/only-controller"
      );
    });
  });

  context("when the timestamp overflows", () => {
    let overflowMintTimestamp: number;

    beforeEach(async () => {
      await ticket.connect(wallet1).mint(wallet1.address, toWei("100"));

      const timestamp: number = (await ethers.provider.getBlock("latest")).timestamp;
      const timeUntilOverflow: number = 2 ** 32 - timestamp;

      await increaseTime(timeUntilOverflow);

      await ticket.connect(wallet1).mint(wallet1.address, toWei("100"));

      overflowMintTimestamp = (await ethers.provider.getBlock("latest")).timestamp;

      await increaseTime(100);
    });

    describe("getAverageBalanceBetween()", () => {
      it("should function across overflow boundary", async () => {
        expect(
          await ticket
            .connect(wallet1)
            .getAverageBalanceBetween(wallet1.address, overflowMintTimestamp - 100, overflowMintTimestamp + 100)
        ).to.equal(toWei("150"));
      });
    });
  });
});
