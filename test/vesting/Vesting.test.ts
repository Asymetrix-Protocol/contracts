import { BigNumber, Contract, ContractFactory, ContractTransaction, constants, utils } from "ethers";

import { increaseTime as increaseTimeHelper } from "../core/helpers/increaseTime";

import { getPreviousBlockTimestamp } from "../core/helpers/getBlockTimestamp";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import deepEqualInAnyOrder from "deep-equal-in-any-order";

import hre, { ethers, upgrades } from "hardhat";

import chai, { expect } from "chai";

const { AddressZero }: any = constants;
const { provider }: any = ethers;

const increaseTime = (time: number): Promise<void> => increaseTimeHelper(provider, time);

const computeReleasableAmount = async (vestingSchedule: VestingSchedule): Promise<BigNumber> => {
  const previousBlockTimestamp: BigNumber = await getPreviousBlockTimestamp();
  const lockEndTime: BigNumber = BigNumber.from(vestingSchedule.startTimestamp).add(vestingSchedule.lockPeriod);

  if (previousBlockTimestamp.lt(lockEndTime) || vestingSchedule.released.eq(vestingSchedule.amount)) {
    return BigNumber.from(0);
  } else {
    const secondsWithdraw: BigNumber = previousBlockTimestamp.sub(lockEndTime);

    if (secondsWithdraw.gte(vestingSchedule.releasePeriod)) {
      return BigNumber.from(vestingSchedule.amount).sub(vestingSchedule.released);
    } else {
      return secondsWithdraw
        .mul(vestingSchedule.amount.div(vestingSchedule.releasePeriod))
        .sub(vestingSchedule.released);
    }
  }
};

type VestingSchedule = {
  amount: BigNumber;
  released: BigNumber;
  owner: string;
  startTimestamp: number;
  lockPeriod: number;
  releasePeriod: number;
  ended: boolean;
};

chai.use(deepEqualInAnyOrder);

describe("Vesting", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;
  let wallet4: SignerWithAddress;

  let Vesting: ContractFactory;
  let ASX: ContractFactory;

  let erc20Token: Contract;
  let vesting: Contract;
  let asx: Contract;

  before("setup", async () => {
    [wallet1, wallet2, wallet3, wallet4] = await ethers.getSigners();
  });

  beforeEach(async () => {
    ASX = await ethers.getContractFactory("ASX");
    asx = await upgrades.deployProxy(ASX, ["Asymetrix Token", "ASX", utils.parseEther("100000000"), wallet1.address]);

    await asx.deployed();

    erc20Token = await upgrades.deployProxy(ASX, ["Test Token", "TT", utils.parseEther("100000000"), wallet1.address]);

    await erc20Token.deployed();

    Vesting = await ethers.getContractFactory("Vesting");
    vesting = await Vesting.deploy(asx.address);

    await vesting.deployed();
  });

  describe("constructor()", () => {
    it("should fail if provided token address is not a contract address", async () => {
      await expect(Vesting.deploy(wallet1.address)).to.be.revertedWith("Vesting: invalid ASX token address");
      await expect(Vesting.deploy(AddressZero)).to.be.revertedWith("Vesting: invalid ASX token address");
    });

    it("should properly deploy Vesting contract and set initial data", async () => {
      const vesting: Contract = await Vesting.deploy(asx.address);

      expect(await vesting.connect(wallet1).getToken()).to.equal(asx.address);
    });
  });

  describe("getToken()", () => {
    it("should read ASX token address", async () => {
      expect(await vesting.connect(wallet1).getToken()).to.equal(asx.address);
    });
  });

  describe("getVestingSchedulesCount()", () => {
    it("should read vesting schedules count", async () => {
      expect(await vesting.connect(wallet1).getVestingSchedulesCount()).to.equal(BigNumber.from(0));

      const amount: BigNumber = utils.parseEther("1");

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [1], [1]);

      expect(await vesting.connect(wallet1).getVestingSchedulesCount()).to.equal(BigNumber.from(1));
    });
  });

  describe("getTotalDistributionAmount()", () => {
    it("should read total distribution amount", async () => {
      expect(await vesting.connect(wallet1).getTotalDistributionAmount()).to.equal(BigNumber.from(0));

      const amount: BigNumber = utils.parseEther("100");

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [1], [1]);

      expect(await vesting.connect(wallet1).getTotalDistributionAmount()).to.equal(amount);
    });
  });

  describe("getTotalReleasedAmount()", () => {
    it("should read total released amount", async () => {
      expect(await vesting.connect(wallet1).getTotalReleasedAmount()).to.equal(BigNumber.from(0));

      const amount: BigNumber = utils.parseEther("500");

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [1], [1]);

      await increaseTime(50);

      await vesting.connect(wallet1).release([BigNumber.from(0)], [wallet1.address]);

      expect(await vesting.connect(wallet1).getTotalReleasedAmount()).to.equal(amount);
    });
  });

  describe("getVestingSchedule()", () => {
    it("should read non existent vesting schedule", async () => {
      const vestingSchedule: VestingSchedule = await vesting.connect(wallet1).getVestingSchedule(BigNumber.from(666));

      expect(vestingSchedule).to.deep.equalInAnyOrder([BigNumber.from(0), BigNumber.from(0), AddressZero, 0, 0, 0]);
    });

    it("should read existing vesting schedule", async () => {
      const account: string = wallet1.address;
      const amount: BigNumber = utils.parseEther("500");
      const lockPeriod: number = 1;
      const releasePeriod: number = 1;

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([account], [amount], [lockPeriod], [releasePeriod]);

      const vestingSchedule: VestingSchedule = await vesting.connect(wallet1).getVestingSchedule(BigNumber.from(0));

      expect(vestingSchedule).to.deep.equalInAnyOrder([
        amount,
        BigNumber.from(0),
        account,
        (await getPreviousBlockTimestamp()).toNumber(),
        lockPeriod,
        releasePeriod,
      ]);
    });
  });

  describe("getPaginatedVestingSchedules()", () => {
    const amountSchedules: number = 20;
    let accounts: string[];
    let amounts: BigNumber[];
    let lockPeriods: number[];
    let releasePeriods: number[];

    beforeEach(async () => {
      const amount = utils.parseEther("500");
      const lockPeriod: number = 1;
      const releasePeriod: number = 1;

      await asx.connect(wallet1).transfer(vesting.address, amount.mul(amountSchedules));

      accounts = Array(amountSchedules)
        .fill("")
        .map(() => ethers.Wallet.createRandom().address);
      amounts = Array(amountSchedules).fill(amount);
      lockPeriods = Array(amountSchedules).fill(lockPeriod);
      releasePeriods = Array(amountSchedules).fill(releasePeriod);

      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);
    });

    it("should fail to read with invalid range", async () => {
      await expect(vesting.getPaginatedVestingSchedules(5, 4)).to.be.rejectedWith("Vesting: invalid range");
    });

    it("should fail to read with fromIndex out of bounds", async () => {
      await expect(vesting.getPaginatedVestingSchedules(amountSchedules, amountSchedules)).to.be.rejectedWith(
        "Vesting: fromVsid out of bounds"
      );
    });

    it("should fail to read with toIndex out of bounds", async () => {
      await expect(vesting.getPaginatedVestingSchedules(amountSchedules - 1, amountSchedules)).to.be.rejectedWith(
        "Vesting: toVsid out of bounds"
      );
    });

    it("should read all existing vesting schedules", async () => {
      const vestingSchedules: VestingSchedule[] = await vesting.getPaginatedVestingSchedules(0, amountSchedules - 1);

      expect(vestingSchedules.length).to.be.equal(amountSchedules);

      for (let i: number = 0; i < vestingSchedules.length; ++i) {
        expect(vestingSchedules[i].owner).to.be.equal(accounts[i]);
        expect(vestingSchedules[i].amount).to.be.equal(amounts[i]);
        expect(vestingSchedules[i].lockPeriod).to.be.equal(lockPeriods[i]);
        expect(vestingSchedules[i].releasePeriod).to.be.equal(releasePeriods[i]);
      }
    });

    it("should read the first vesting schedule", async () => {
      const vestingSchedules: VestingSchedule[] = await vesting.getPaginatedVestingSchedules(0, 0);

      expect(vestingSchedules.length).to.be.equal(1);
      expect(vestingSchedules[0].owner).to.be.equal(accounts[0]);
      expect(vestingSchedules[0].amount).to.be.equal(amounts[0]);
      expect(vestingSchedules[0].lockPeriod).to.be.equal(lockPeriods[0]);
      expect(vestingSchedules[0].releasePeriod).to.be.equal(releasePeriods[0]);
    });

    it("should read the middle vesting schedule", async () => {
      const elementIndex: number = amountSchedules / 2;
      const vestingSchedules: VestingSchedule[] = await vesting.getPaginatedVestingSchedules(
        elementIndex,
        elementIndex
      );

      expect(vestingSchedules.length).to.be.equal(1);
      expect(vestingSchedules[0].owner).to.be.equal(accounts[elementIndex]);
      expect(vestingSchedules[0].amount).to.be.equal(amounts[elementIndex]);
      expect(vestingSchedules[0].lockPeriod).to.be.equal(lockPeriods[elementIndex]);
      expect(vestingSchedules[0].releasePeriod).to.be.equal(releasePeriods[elementIndex]);
    });

    it("should read only the last vesting schedule", async () => {
      const elementIndex: number = amountSchedules - 1;
      const vestingSchedules: VestingSchedule[] = await vesting.getPaginatedVestingSchedules(
        elementIndex,
        elementIndex
      );

      expect(vestingSchedules.length).to.be.equal(1);
      expect(vestingSchedules[0].owner).to.be.equal(accounts[elementIndex]);
      expect(vestingSchedules[0].amount).to.be.equal(amounts[elementIndex]);
      expect(vestingSchedules[0].lockPeriod).to.be.equal(lockPeriods[elementIndex]);
      expect(vestingSchedules[0].releasePeriod).to.be.equal(releasePeriods[elementIndex]);
    });

    it("should read the lower half of vesting schedules", async () => {
      const toIndex: number = amountSchedules / 2;
      const vestingSchedules: VestingSchedule[] = await vesting.getPaginatedVestingSchedules(0, toIndex);

      expect(vestingSchedules.length).to.be.equal(toIndex + 1);

      for (let i: number = 0; i < vestingSchedules.length; ++i) {
        expect(vestingSchedules[i].owner).to.be.equal(accounts[i]);
        expect(vestingSchedules[i].amount).to.be.equal(amounts[i]);
        expect(vestingSchedules[i].lockPeriod).to.be.equal(lockPeriods[i]);
        expect(vestingSchedules[i].releasePeriod).to.be.equal(releasePeriods[i]);
      }
    });

    it("should read the upper half of vesting schedules", async () => {
      const fromIndex: number = amountSchedules / 2;
      const vestingSchedules: VestingSchedule[] = await vesting.getPaginatedVestingSchedules(
        fromIndex,
        amountSchedules - 1
      );

      expect(vestingSchedules.length).to.be.equal(amountSchedules - fromIndex);

      for (let i: number = 0; i < vestingSchedules.length; ++i) {
        expect(vestingSchedules[i].owner).to.be.equal(accounts[fromIndex + i]);
        expect(vestingSchedules[i].amount).to.be.equal(amounts[fromIndex + i]);
        expect(vestingSchedules[i].lockPeriod).to.be.equal(lockPeriods[fromIndex + i]);
        expect(vestingSchedules[i].releasePeriod).to.be.equal(releasePeriods[fromIndex + i]);
      }
    });

    it("should read some vesting schedules in the middle", async () => {
      const fromIndex: number = amountSchedules / 2;
      const toIndex: number = fromIndex + 5;
      const vestingSchedules: VestingSchedule[] = await vesting.getPaginatedVestingSchedules(fromIndex, toIndex);

      expect(vestingSchedules.length).to.be.equal(toIndex - fromIndex + 1);

      for (let i: number = 0; i < vestingSchedules.length; ++i) {
        expect(vestingSchedules[i].owner).to.be.equal(accounts[fromIndex + i]);
        expect(vestingSchedules[i].amount).to.be.equal(amounts[fromIndex + i]);
        expect(vestingSchedules[i].lockPeriod).to.be.equal(lockPeriods[fromIndex + i]);
        expect(vestingSchedules[i].releasePeriod).to.be.equal(releasePeriods[fromIndex + i]);
      }
    });
  });

  describe("getReleasableAmount()", () => {
    it("should compute releasable amount - 1", async () => {
      expect(await vesting.connect(wallet1).getReleasableAmount(BigNumber.from(0))).to.equal(BigNumber.from(0));

      const amount: BigNumber = utils.parseEther("500");

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [1], [1]);

      await increaseTime(50);

      expect(await vesting.connect(wallet1).getReleasableAmount(BigNumber.from(0))).to.equal(amount);
    });

    it("should compute releasable amount - 2", async () => {
      const amount: BigNumber = utils.parseEther("500");

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [10], [10]);

      expect(await vesting.connect(wallet1).getReleasableAmount(BigNumber.from(0))).to.equal(BigNumber.from(0));
    });

    it("should compute releasable amount - 3", async () => {
      const amount: BigNumber = utils.parseEther("500");

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [10], [10]);

      await increaseTime(50);

      const vsid: BigNumber = BigNumber.from(0);

      await vesting.connect(wallet1).release([vsid], [wallet1.address]);

      expect(await vesting.connect(wallet1).getReleasableAmount(vsid)).to.equal(BigNumber.from(0));
    });
  });

  describe("createVestingSchedule()", () => {
    it("should fail if not an owner is trying to create a vesting schedule", async () => {
      await expect(
        vesting.connect(wallet2).createVestingSchedule([wallet1.address], [BigNumber.from(1)], [1], [1])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should fail if accounts array length is equal to zero", async () => {
      await expect(
        vesting.connect(wallet1).createVestingSchedule([], [BigNumber.from(1)], [1], [1])
      ).to.be.revertedWith("Vesting: accounts array length must be greater than 0");
    });

    it("should fail if parameters lengths mismatch", async () => {
      await expect(vesting.connect(wallet1).createVestingSchedule([wallet1.address], [], [1], [1])).to.be.revertedWith(
        "Vesting: lengths mismatch"
      );
      await expect(
        vesting.connect(wallet1).createVestingSchedule([wallet1.address], [BigNumber.from(1)], [], [1])
      ).to.be.revertedWith("Vesting: lengths mismatch");
      await expect(
        vesting.connect(wallet1).createVestingSchedule([wallet1.address], [BigNumber.from(1)], [1], [])
      ).to.be.revertedWith("Vesting: lengths mismatch");
    });

    it("should fail if not enough unused ASX tokens on the Vesting contract", async () => {
      await expect(
        vesting.connect(wallet1).createVestingSchedule([wallet1.address], [BigNumber.from(1)], [1], [1])
      ).to.be.revertedWith("Vesting: not enough unused ASX tokens");
    });

    it("should fail if account address is invalid", async () => {
      const amount: BigNumber = utils.parseEther("1");

      await asx.connect(wallet1).transfer(vesting.address, amount);

      await expect(
        vesting.connect(wallet1).createVestingSchedule([AddressZero], [amount], [1], [1])
      ).to.be.revertedWith("Vesting: invalid account address");
    });

    it("should fail if amount is equal to zero", async () => {
      await expect(
        vesting.connect(wallet1).createVestingSchedule([wallet1.address], [BigNumber.from(0)], [1], [1])
      ).to.be.revertedWith("Vesting: amount must be greater than or equal to 1");
    });

    it("should fail if lock period is equal to zero", async () => {
      const amount: BigNumber = utils.parseEther("1");

      await asx.connect(wallet1).transfer(vesting.address, amount);

      await expect(
        vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [0], [1])
      ).to.be.revertedWith("Vesting: lock period must be greater than 0");
    });

    it("should fail if release period is equal to zero", async () => {
      const amount: BigNumber = utils.parseEther("1");

      await asx.connect(wallet1).transfer(vesting.address, amount);

      await expect(
        vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount], [1], [0])
      ).to.be.revertedWith("Vesting: release period must be greater than 0");
    });

    it("should create new vesting schedules", async () => {
      const accounts: string[] = [wallet1.address, wallet2.address, wallet3.address];
      const amounts: BigNumber[] = [utils.parseEther("100"), utils.parseEther("1000"), utils.parseEther("10000")];
      const lockPeriods: number[] = [1, 2, 3];
      const releasePeriods: number[] = [1, 2, 3];

      await asx.connect(wallet1).transfer(
        vesting.address,
        amounts.reduce((sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount), BigNumber.from(0))
      );

      const tx: ContractTransaction = vesting
        .connect(wallet1)
        .createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      for (let i: number = 0; i < accounts.length; ++i) {
        await expect(tx)
          .to.emit(vesting, "VestingScheduleCreated")
          .withArgs([
            amounts[i],
            BigNumber.from(0),
            accounts[i],
            i == 0
              ? (await getPreviousBlockTimestamp()).toNumber() + 1
              : (await getPreviousBlockTimestamp()).toNumber(),
            lockPeriods[i],
            releasePeriods[i],
          ]);

        const vestingSchedule: VestingSchedule = await vesting.connect(wallet1).getVestingSchedule(BigNumber.from(i));

        expect(vestingSchedule).to.deep.equalInAnyOrder([
          amounts[i],
          BigNumber.from(0),
          accounts[i],
          (await getPreviousBlockTimestamp()).toNumber(),
          lockPeriods[i],
          releasePeriods[i],
        ]);
      }
    });

    it("should increase vesting schedules counter", async () => {
      const accounts: string[] = [wallet1.address, wallet2.address, wallet3.address];
      const amounts: BigNumber[] = [utils.parseEther("100"), utils.parseEther("1000"), utils.parseEther("10000")];
      const lockPeriods: number[] = [1, 2, 3];
      const releasePeriods: number[] = [1, 2, 3];

      expect(await vesting.connect(wallet1).getVestingSchedulesCount()).to.equal(BigNumber.from(0));

      await asx.connect(wallet1).transfer(
        vesting.address,
        amounts.reduce((sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount), BigNumber.from(0))
      );
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      expect(await vesting.connect(wallet1).getVestingSchedulesCount()).to.equal(BigNumber.from(accounts.length));
    });

    it("should increase total distribution amount", async () => {
      const accounts: string[] = [wallet1.address, wallet2.address, wallet3.address];
      const amounts: BigNumber[] = [utils.parseEther("100"), utils.parseEther("1000"), utils.parseEther("10000")];
      const lockPeriods: number[] = [1, 2, 3];
      const releasePeriods: number[] = [1, 2, 3];

      expect(await vesting.connect(wallet1).getTotalDistributionAmount()).to.equal(BigNumber.from(0));

      const expectedTotalDistributionAmount: BigNumber = amounts.reduce(
        (sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount),
        BigNumber.from(0)
      );

      await asx.connect(wallet1).transfer(vesting.address, expectedTotalDistributionAmount);
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      expect(await vesting.connect(wallet1).getTotalDistributionAmount()).to.equal(expectedTotalDistributionAmount);
    });
  });

  describe("release()", () => {
    it("should fail if vesting schedules IDs array length is equal to zero", async () => {
      await expect(vesting.connect(wallet1).release([], [wallet1.address])).to.be.revertedWith(
        "Vesting: vesting schedules IDs array length must be greater than 0"
      );
    });

    it("should fail if parameters lengths mismatch", async () => {
      await expect(vesting.connect(wallet1).release([BigNumber.from(0)], [])).to.be.revertedWith(
        "Vesting: lengths mismatch"
      );
    });

    it("should fail if invalid recipient address", async () => {
      await expect(vesting.connect(wallet1).release([BigNumber.from(0)], [AddressZero])).to.be.revertedWith(
        "Vesting: invalid recipient address"
      );
    });

    it("should fail if vesting schedule does not exist", async () => {
      await expect(vesting.connect(wallet1).release([BigNumber.from(0)], [wallet1.address])).to.be.revertedWith(
        "Vesting: vesting schedule does not exist"
      );
    });

    it("should fail if not an owner of a vesting schedule is trying to release ASX tokens", async () => {
      const accounts: string[] = [wallet1.address];
      const amounts: BigNumber[] = [utils.parseEther("100")];
      const lockPeriods: number[] = [1];
      const releasePeriods: number[] = [1];

      await asx.connect(wallet1).transfer(
        vesting.address,
        amounts.reduce((sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount), BigNumber.from(0))
      );
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      await expect(vesting.connect(wallet2).release([BigNumber.from(0)], [wallet1.address])).to.be.revertedWith(
        "Vesting: caller is not an owner of a vesting schedule"
      );
    });

    it("should fail if vesting schedule is ended", async () => {
      const accounts: string[] = [wallet1.address];
      const amounts: BigNumber[] = [utils.parseEther("100")];
      const lockPeriods: number[] = [1];
      const releasePeriods: number[] = [1];

      await asx.connect(wallet1).transfer(
        vesting.address,
        amounts.reduce((sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount), BigNumber.from(0))
      );
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      await increaseTime(50);

      await vesting.connect(wallet1).release([BigNumber.from(0)], [wallet1.address]);

      await expect(vesting.connect(wallet1).release([BigNumber.from(0)], [wallet1.address])).to.be.revertedWith(
        "Vesting: vesting schedule is ended"
      );
    });

    it("should fail if nothing to release", async () => {
      const accounts: string[] = [wallet1.address];
      const amounts: BigNumber[] = [utils.parseEther("100")];
      const lockPeriods: number[] = [1];
      const releasePeriods: number[] = [1];

      await asx.connect(wallet1).transfer(
        vesting.address,
        amounts.reduce((sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount), BigNumber.from(0))
      );
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      await expect(vesting.connect(wallet1).release([BigNumber.from(0)], [wallet1.address])).to.be.revertedWith(
        "Vesting: nothing to release"
      );
    });

    it("should release ASX tokens - 1 (after lock finishing and  full release period)", async () => {
      const accounts: string[] = [wallet1.address, wallet1.address];
      const amounts: BigNumber[] = [utils.parseEther("100"), utils.parseEther("1000")];
      const lockPeriods: number[] = [1, 2];
      const releasePeriods: number[] = [1, 2];

      const accumulatedAmount: BigNumber = amounts.reduce(
        (sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount),
        BigNumber.from(0)
      );

      await asx.connect(wallet1).transfer(vesting.address, accumulatedAmount);
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      await increaseTime(50);

      const vsids: BigNumber[] = [BigNumber.from(0), BigNumber.from(1)];
      const recipients: string[] = [wallet2.address, wallet3.address];

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount);

      for (let i: number = 0; i < accounts.length; ++i) {
        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(BigNumber.from(0));
      }

      const tx: ContractTransaction = await vesting.connect(wallet1).release(vsids, recipients);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(BigNumber.from(0));

      for (let i: number = 0; i < accounts.length; ++i) {
        await expect(tx).to.emit(vesting, "Released").withArgs(vsids[i], recipients[i], amounts[i]);

        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(amounts[i]);
      }
    });

    it("should increase total released amount and decrease total distribution amount", async () => {
      const accounts: string[] = [wallet1.address];
      const amounts: BigNumber[] = [utils.parseEther("100")];
      const lockPeriods: number[] = [1];
      const releasePeriods: number[] = [1];

      await asx.connect(wallet1).transfer(
        vesting.address,
        amounts.reduce((sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount), BigNumber.from(0))
      );
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      await increaseTime(50);

      expect(await vesting.connect(wallet1).getTotalReleasedAmount()).to.equal(BigNumber.from(0));
      expect(await vesting.connect(wallet1).getTotalDistributionAmount()).to.equal(amounts[0]);

      await vesting.connect(wallet1).release([BigNumber.from(0)], [wallet1.address]);

      expect(await vesting.connect(wallet1).getTotalReleasedAmount()).to.equal(amounts[0]);
      expect(await vesting.connect(wallet1).getTotalDistributionAmount()).to.equal(BigNumber.from(0));
    });

    it("should release ASX tokens - 2 (in one second after lock finishing)", async () => {
      const oneYear: number = 31_556_926; // In seconds
      const fourYears: number = 126_227_704; // In seconds

      const accounts: string[] = [wallet3.address];
      const amounts: BigNumber[] = [utils.parseEther("500")];
      const lockPeriods: number[] = [oneYear];
      const releasePeriods: number[] = [fourYears];

      const accumulatedAmount: BigNumber = amounts.reduce(
        (sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount),
        BigNumber.from(0)
      );

      await asx.connect(wallet1).transfer(vesting.address, accumulatedAmount);
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      const vsids: BigNumber[] = [BigNumber.from(0)];
      const recipients: string[] = [wallet2.address];

      await increaseTime(oneYear / 2);

      await expect(vesting.connect(wallet3).release(vsids, recipients)).to.be.revertedWith(
        "Vesting: nothing to release"
      );

      await increaseTime(oneYear / 2);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount);

      for (let i: number = 0; i < accounts.length; ++i) {
        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(BigNumber.from(0));
      }

      const prevVestingSchedule: VestingSchedule = await vesting.connect(wallet1).getVestingSchedule(BigNumber.from(0));

      const tx: ContractTransaction = await vesting.connect(wallet3).release(vsids, recipients);

      const releasedAmount: BigNumber = await computeReleasableAmount(prevVestingSchedule);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount.sub(releasedAmount));

      for (let i: number = 0; i < accounts.length; ++i) {
        await expect(tx).to.emit(vesting, "Released").withArgs(vsids[i], recipients[i], releasedAmount);

        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(releasedAmount);
      }
    });

    it("should release ASX tokens - 3 (in one month after lock finishing)", async () => {
      const oneMonth: number = 2_629_743; // In seconds
      const oneYear: number = 31_556_926; // In seconds
      const twoYears: number = 63_113_851; // In seconds

      const accounts: string[] = [wallet3.address];
      const amounts: BigNumber[] = [utils.parseEther("1000")];
      const lockPeriods: number[] = [oneYear];
      const releasePeriods: number[] = [twoYears];

      const accumulatedAmount: BigNumber = amounts.reduce(
        (sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount),
        BigNumber.from(0)
      );

      await asx.connect(wallet1).transfer(vesting.address, accumulatedAmount);
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      const vsids: BigNumber[] = [BigNumber.from(0)];
      const recipients: string[] = [wallet2.address];

      await increaseTime(oneYear + oneMonth);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount);

      for (let i: number = 0; i < accounts.length; ++i) {
        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(BigNumber.from(0));
      }

      const prevVestingSchedule: VestingSchedule = await vesting.connect(wallet1).getVestingSchedule(BigNumber.from(0));

      const tx: ContractTransaction = await vesting.connect(wallet3).release(vsids, recipients);

      const releasedAmount: BigNumber = await computeReleasableAmount(prevVestingSchedule);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount.sub(releasedAmount));

      for (let i: number = 0; i < accounts.length; ++i) {
        await expect(tx).to.emit(vesting, "Released").withArgs(vsids[i], recipients[i], releasedAmount);

        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(releasedAmount);
      }
    });

    it("should release ASX tokens - 4 (every 2 weeks after lock finishing)", async () => {
      const twoWeeks: number = 1_209_600; // In seconds
      const oneYear: number = 31_556_926; // In seconds
      const threeYears: number = 94_670_777; // In seconds

      const accounts: string[] = [wallet3.address];
      const amounts: BigNumber[] = [utils.parseEther("666")];
      const lockPeriods: number[] = [oneYear];
      const releasePeriods: number[] = [threeYears];

      const accumulatedAmount: BigNumber = amounts.reduce(
        (sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount),
        BigNumber.from(0)
      );

      await asx.connect(wallet1).transfer(vesting.address, accumulatedAmount);
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      const vsids: BigNumber[] = [BigNumber.from(0)];
      const recipients: string[] = [wallet2.address];

      await increaseTime(oneYear);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount);

      let released: BigNumber = BigNumber.from(0);

      // 157 weeks in 3 years
      for (let i: number = 0; i < 157; i += 2) {
        await increaseTime(twoWeeks);

        expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount.sub(released));

        for (let j: number = 0; j < accounts.length; ++j) {
          expect(await asx.connect(wallet1).balanceOf(recipients[j])).to.equal(released);
        }

        const prevVestingSchedule: VestingSchedule = await vesting
          .connect(wallet1)
          .getVestingSchedule(BigNumber.from(0));

        const tx: ContractTransaction = await vesting.connect(wallet3).release(vsids, recipients);

        const releasedAmount: BigNumber = await computeReleasableAmount(prevVestingSchedule);

        released = released.add(releasedAmount);

        expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount.sub(released));

        for (let j: number = 0; j < accounts.length; ++j) {
          await expect(tx).to.emit(vesting, "Released").withArgs(vsids[j], recipients[j], releasedAmount);

          expect(await asx.connect(wallet1).balanceOf(recipients[j])).to.equal(released);
        }
      }

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(BigNumber.from(0));
    });

    it("should release ASX tokens - 5 (different wallets, in one week after lock finishing)", async () => {
      const oneWeek: number = 604_800; // In seconds
      const sixMonths: number = 15_778_463; // In seconds
      const threeYears: number = 94_670_777; // In seconds

      const accounts: string[] = [wallet3.address, wallet3.address];
      const amounts: BigNumber[] = [utils.parseEther("1000"), utils.parseEther("500")];
      const lockPeriods: number[] = [sixMonths, sixMonths];
      const releasePeriods: number[] = [threeYears, threeYears];

      const accumulatedAmount: BigNumber = amounts.reduce(
        (sum: BigNumber, amount: BigNumber): BigNumber => sum.add(amount),
        BigNumber.from(0)
      );

      await asx.connect(wallet1).transfer(vesting.address, accumulatedAmount);
      await vesting.connect(wallet1).createVestingSchedule(accounts, amounts, lockPeriods, releasePeriods);

      const vsids: BigNumber[] = [BigNumber.from(0), BigNumber.from(1)];
      const recipients: string[] = [wallet4.address, wallet4.address];

      await increaseTime(sixMonths + oneWeek);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount);

      let released: BigNumber = BigNumber.from(0);

      for (let i: number = 0; i < accounts.length; ++i) {
        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(released);

        const prevVestingSchedule: VestingSchedule = await vesting
          .connect(wallet1)
          .getVestingSchedule(BigNumber.from(i));

        const tx: ContractTransaction = await vesting.connect(wallet3).release([vsids[i]], [recipients[i]]);

        const releasedAmount: BigNumber = await computeReleasableAmount(prevVestingSchedule);

        released = released.add(releasedAmount);

        expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(accumulatedAmount.sub(released));

        await expect(tx).to.emit(vesting, "Released").withArgs(vsids[i], recipients[i], releasedAmount);

        expect(await asx.connect(wallet1).balanceOf(recipients[i])).to.equal(released);
      }
    });
  });

  describe("withdraw()", () => {
    it("should fail if not an owner is trying to withdraw unused ASX tokens", async () => {
      await expect(
        vesting.connect(wallet2).withdraw(asx.address, BigNumber.from(1), wallet1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should fail if invalid recipient address", async () => {
      const amount: BigNumber = utils.parseEther("1");

      await asx.connect(wallet1).transfer(vesting.address, amount);

      await expect(vesting.connect(wallet1).withdraw(asx.address, amount, AddressZero)).to.be.revertedWith(
        "Vesting: invalid recipient address"
      );
    });

    it("should withdraw ETH tokens by an owner", async () => {
      const token: string = AddressZero;
      const amount: BigNumber = utils.parseEther("1");
      const recipient: string = wallet2.address;

      await hre.network.provider.send("hardhat_setBalance", [vesting.address, "0xDE0B6B3A7640000"]); // 1 ETH

      expect(await vesting.provider.getBalance(vesting.address)).to.be.equal(amount);

      const prevWallet2EthBalance: BigNumber = await wallet2.getBalance();

      await expect(vesting.connect(wallet1).withdraw(token, amount.div(2), recipient))
        .to.emit(vesting, "Withdrawn")
        .withArgs(token, recipient, amount.div(2));

      expect(await vesting.provider.getBalance(vesting.address)).to.be.equal(amount.div(2));
      expect(await wallet2.getBalance()).to.be.equal(prevWallet2EthBalance.add(amount.div(2)));
    });

    it("should withdraw any ERC-20 tokens by an owner", async () => {
      const token: string = erc20Token.address;
      const amount: BigNumber = utils.parseEther("100");
      const recipient: string = wallet2.address;

      await erc20Token.connect(wallet1).transfer(vesting.address, amount);

      expect(await erc20Token.connect(wallet1).balanceOf(vesting.address)).to.be.equal(amount);

      const prevWallet2TokenBalance: BigNumber = await erc20Token.connect(wallet1).balanceOf(wallet2.address);

      await expect(vesting.connect(wallet1).withdraw(token, amount.div(2), recipient))
        .to.emit(vesting, "Withdrawn")
        .withArgs(token, recipient, amount.div(2));

      expect(await erc20Token.connect(wallet1).balanceOf(vesting.address)).to.be.equal(amount.div(2));
      expect(await erc20Token.connect(wallet1).balanceOf(wallet2.address)).to.be.equal(
        prevWallet2TokenBalance.add(amount.div(2))
      );
    });

    it("should fail if not enough unused ASX tokens on the Vesting contract", async () => {
      await expect(
        vesting.connect(wallet1).withdraw(asx.address, BigNumber.from(1), wallet1.address)
      ).to.be.revertedWith("Vesting: not enough unused ASX tokens");
    });

    it("should withdraw unused ASX tokens by an owner", async () => {
      const token: string = asx.address;
      const amount: BigNumber = utils.parseEther("500");
      const recipient: string = wallet2.address;

      await asx.connect(wallet1).transfer(vesting.address, amount);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(amount);
      expect(await asx.connect(wallet1).balanceOf(recipient)).to.equal(BigNumber.from(0));

      await expect(vesting.connect(wallet1).withdraw(token, amount, recipient))
        .to.emit(vesting, "Withdrawn")
        .withArgs(token, recipient, amount);

      expect(await asx.connect(wallet1).balanceOf(vesting.address)).to.equal(BigNumber.from(0));
      expect(await asx.connect(wallet1).balanceOf(recipient)).to.equal(amount);
    });
  });

  describe("getWithdrawableASXAmount()", () => {
    it("should return proper withdrawable ASX amount - 1", async () => {
      const amount: BigNumber = utils.parseEther("1000");

      await asx.connect(wallet1).transfer(vesting.address, amount);

      expect(await vesting.connect(wallet1).getWithdrawableASXAmount()).to.equal(amount);
    });

    it("should return proper withdrawable ASX amount - 2", async () => {
      const amount: BigNumber = utils.parseEther("1000");

      await asx.connect(wallet1).transfer(vesting.address, amount);
      await vesting.connect(wallet1).createVestingSchedule([wallet1.address], [amount.div(3)], [1], [1]);

      expect(await vesting.connect(wallet1).getWithdrawableASXAmount()).to.equal(amount.div(3).mul(2).add(1));
    });
  });
});
