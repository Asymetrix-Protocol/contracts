import { Contract, ContractFactory, constants, BigNumber } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { getContractFactory, getSigners, utils } = ethers;
const { parseEther: toWei } = utils;
const { AddressZero } = constants;

describe("Reserve", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;

  let ReserveHarnessFactory: ContractFactory;
  let erc20MintableFactory: ContractFactory;

  let reserve: Contract;
  let ticket: Contract;

  before(async () => {
    [wallet1, wallet2] = await getSigners();

    erc20MintableFactory = await getContractFactory("contracts/core/test/ERC20Mintable.sol:ERC20Mintable");
    ReserveHarnessFactory = await getContractFactory("ReserveHarness");
  });

  beforeEach(async () => {
    ticket = await upgrades.deployProxy(erc20MintableFactory, ["Ticket", "TICK"]);
    reserve = await upgrades.deployProxy(ReserveHarnessFactory, [wallet1.address, ticket.address]);
  });

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(reserve.connect(wallet1).initialize(wallet1.address, ticket.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing", async () => {
      await expect(
        reserve.connect(wallet1).testOnlyInitializingModifier(wallet1.address, ticket.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if `_token` is zero address", async () => {
      await expect(upgrades.deployProxy(ReserveHarnessFactory, [wallet1.address, AddressZero])).to.be.revertedWith(
        "Reserve/token-can-not-be-zero-address"
      );
    });

    it("should deploy Reserve contract and properly initialize it", async () => {
      const reserve: Contract = await upgrades.deployProxy(ReserveHarnessFactory, [wallet1.address, ticket.address]);

      expect(reserve.deployTransaction).to.emit(reserve, "Deployed").withArgs(ticket.address);

      expect(await reserve.connect(wallet1).getToken()).to.equal(ticket.address);
    });
  });

  describe("getToken()", () => {
    it("should return the token address", async () => {
      expect(await reserve.connect(wallet1).getToken()).to.equal(ticket.address);
    });
  });

  describe("checkpoint()", () => {
    it("will succeed creating checkpoint with 0 balance", async () => {
      await expect(reserve.connect(wallet1).checkpoint()).to.not.emit(reserve, "Checkpoint");
    });

    it("will succeed creating checkpoint with positive balance", async () => {
      await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

      await expect(reserve.connect(wallet1).checkpoint()).to.emit(reserve, "Checkpoint").withArgs(toWei("100"), 0);
    });

    it("will succeed creating checkpoint with positive balance and after withdrawal", async () => {
      await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

      await reserve.connect(wallet1).withdrawTo(wallet2.address, toWei("100"));

      await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

      await expect(reserve.connect(wallet1).checkpoint())
        .to.emit(reserve, "Checkpoint")
        .withArgs(toWei("200"), toWei("100"));
    });
    it("two checkpoints in a row, no event from second", async () => {
      await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

      await reserve.connect(wallet1).checkpoint();

      await expect(reserve.connect(wallet1).checkpoint()).to.not.emit(reserve, "Checkpoint");
    });

    it("two checkpoints same block", async () => {
      await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

      await expect(reserve.connect(wallet1).doubleCheckpoint(ticket.address, toWei("50")))
        .to.emit(reserve, "Checkpoint")
        .withArgs(toWei("100"), 0)
        .and.to.emit(reserve, "Checkpoint")
        .withArgs(toWei("150"), 0);
    });
  });

  describe("getReserveAccumulatedBetween()", () => {
    context("with one observation", () => {
      it("start and end before observations", async () => {
        // s e |
        await reserve.connect(wallet1).setObservationsAt([{ timestamp: 5, amount: 70 }]);

        expect(await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 3)).to.equal(0);
      });

      it("start before and end at observation", async () => {
        // s e|
        await reserve.connect(wallet1).setObservationsAt([{ timestamp: 5, amount: 70 }]);

        expect(await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 5)).to.equal(70);
      });

      it("start and end around observation", async () => {
        // s | e
        await reserve.connect(wallet1).setObservationsAt([{ timestamp: 5, amount: 70 }]);

        expect(await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 6)).to.equal(70);
      });

      it("start at and end after observation", async () => {
        // s| e
        await reserve.connect(wallet1).setObservationsAt([{ timestamp: 5, amount: 70 }]);

        expect(await reserve.connect(wallet1).getReserveAccumulatedBetween(5, 6)).to.equal(0);
      });
      it("start and end after observation", async () => {
        // | s e
        await reserve.connect(wallet1).setObservationsAt([{ timestamp: 5, amount: 70 }]);
        expect(await reserve.connect(wallet1).getReserveAccumulatedBetween(6, 7)).to.equal(0);
      });
    });

    context("with two observations", () => {
      it("start and end before observations", async () => {
        // s e []
        const observations: any[] = [
          {
            timestamp: 5,
            amount: 70,
          },
          {
            timestamp: 8,
            amount: 72,
          },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 3);

        expect(result).to.equal(0);
      });

      it("start before and end inside", async () => {
        // s [ e ]
        const observations: any[] = [
          {
            timestamp: 5,
            amount: 70,
          },
          {
            timestamp: 8,
            amount: 72,
          },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 6);

        expect(result).to.equal(70);
      });

      it("start before and end at first observation", async () => {
        // s [e ]
        const observations: any[] = [
          {
            timestamp: 5,
            amount: 70,
          },
          {
            timestamp: 8,
            amount: 72,
          },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 5);

        expect(result).to.equal(70);
      });

      it("start before and end at second observation", async () => {
        // s [ e]
        const observations: any[] = [
          { timestamp: 5, amount: 70 },
          { timestamp: 8, amount: 72 },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 8);

        expect(result).to.equal(72);
      });

      it("both start and end inside", async () => {
        // [ s e ]
        const observations: any[] = [
          { timestamp: 5, amount: 70 },
          { timestamp: 8, amount: 72 },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(6, 7);

        expect(result).to.equal(0);
      });

      it("start inside and end at second", async () => {
        // [ s e]
        const observations: any[] = [
          { timestamp: 5, amount: 70 },
          { timestamp: 8, amount: 72 },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(6, 8);

        expect(result).to.equal(2);
      });

      it("start at first and end at second", async () => {
        // [s e]
        const observations: any[] = [
          { timestamp: 5, amount: 70 },
          { timestamp: 8, amount: 72 },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(5, 8);

        expect(result).to.equal(2);
      });

      it("start inside and end after", async () => {
        // [ s ] e
        const observations: any[] = [
          { timestamp: 5, amount: 70 },
          { timestamp: 8, amount: 72 },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(6, 10);

        expect(result).to.equal(2);
      });

      it("start at end and end after", async () => {
        // [ s] e
        const observations: any[] = [
          { timestamp: 5, amount: 70 },
          { timestamp: 8, amount: 72 },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(8, 29);

        expect(result).to.equal(0);
      });

      it("start after and end after", async () => {
        // [] s e
        const observations: any[] = [
          { timestamp: 5, amount: 70 },
          { timestamp: 8, amount: 72 },
        ];

        await reserve.connect(wallet1).setObservationsAt(observations);

        const result: BigNumber = await reserve.connect(wallet1).getReserveAccumulatedBetween(18, 29);

        expect(result).to.equal(0);
      });
    });

    it("should revert if start timestamp is before end timestamp", async () => {
      await reserve.connect(wallet1).setObservationsAt([{ timestamp: 5, amount: 70 }]);

      await expect(reserve.connect(wallet1).getReserveAccumulatedBetween(3, 2)).to.be.revertedWith(
        "Reserve/start-less-then-end"
      );
    });

    it("should return 0 if no observation has been recorded", async () => {
      expect(await reserve.connect(wallet1).getReserveAccumulatedBetween(2, 3)).to.equal(0);
    });
  });

  describe("withdrawTo()", () => {
    it("should fail if not owner or not manager is trying to withdraw token", async () => {
      await expect(reserve.connect(wallet2).withdrawTo(wallet2.address, toWei("10"))).to.be.revertedWith(
        "Manageable/caller-not-manager-or-owner"
      );
    });

    it("should emit Checkpoint, Transfer and Withdrawn events", async () => {
      await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

      await expect(reserve.connect(wallet1).withdrawTo(wallet2.address, toWei("10")))
        .to.emit(reserve, "Checkpoint")
        .and.to.emit(ticket, "Transfer")
        .and.to.emit(reserve, "Withdrawn");

      it("should emit Checkpoint event", async () => {
        await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

        await expect(reserve.connect(wallet1).withdrawTo(wallet2.address, toWei("10")))
          .to.emit(reserve, "Checkpoint")
          .withArgs(toWei("100"), 0);
      });

      it("should emit Withdrawn event", async () => {
        await ticket.connect(wallet1).mint(reserve.address, toWei("100"));

        await expect(reserve.connect(wallet1).withdrawTo(wallet2.address, toWei("10")))
          .and.to.emit(reserve, "Withdrawn")
          .withArgs(wallet2.address, toWei("10"));

        expect(await ticket.connect(wallet1).balanceOf(wallet2.address)).to.equal(toWei("10"));
      });
    });
  });

  it("should retrieve oldest observation", async () => {
    await reserve.connect(wallet1).getOldestObservation();
  });
});
