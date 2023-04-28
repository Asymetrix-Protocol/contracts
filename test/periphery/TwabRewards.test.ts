import ERC20MintableInterface from "../../artifacts/contracts/core/test/ERC20Mintable.sol/ERC20Mintable.json";
import TicketInterface from "../../artifacts/contracts/core/Ticket.sol/Ticket.json";

import { getFirstLidoRebaseTimestamp } from "../../scripts/helpers/getFirstLidoRebaseTimestamp";

import { increaseTime as increaseTimeUtil, setTime as setTimeUtil } from "./utils/increaseTime";

import { deployMockContract, MockContract } from "@ethereum-waffle/mock-contract";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, Contract, ContractFactory, Wallet } from "ethers";

import hardhat, { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const increaseTime = (time: number) => increaseTimeUtil(provider, time);

const { constants, getContractFactory, getSigners, provider, utils } = ethers;
const { AddressZero, Zero } = constants;
const { parseEther: toWei } = utils;

describe("TwabRewards", () => {
  let wallet1: SignerWithAddress;
  let wallet2: SignerWithAddress;
  let wallet3: SignerWithAddress;

  let erc20MintableFactory: ContractFactory;
  let twabRewardsFactory: ContractFactory;
  let PrizePoolHarness: ContractFactory;
  let ticketFactory: ContractFactory;
  let ASX: ContractFactory;

  let twabRewards: Contract;
  let rewardToken: Contract;
  let prizePool: Contract;
  let ticket: Contract;
  let asx: Contract;

  let mockRewardToken: MockContract;
  let mockTicket: MockContract;

  let createPromotionTimestamp: number;

  const setTime = (time: number) => setTimeUtil(provider, createPromotionTimestamp + time);

  before(async () => {
    [wallet1, wallet2, wallet3] = await getSigners();

    erc20MintableFactory = await getContractFactory("contracts/core/test/ERC20Mintable.sol:ERC20Mintable");
    ticketFactory = await getContractFactory("TicketHarness");
    twabRewardsFactory = await getContractFactory("TwabRewardsHarness");
  });

  beforeEach(async () => {
    await hardhat.network.provider.send("hardhat_reset");

    rewardToken = await upgrades.deployProxy(erc20MintableFactory, ["Reward", "REWA"]);

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

    ticket = await upgrades.deployProxy(ticketFactory, ["Ticket", "TICK", 18, wallet1.address]);

    await prizePool.setTicket(ticket.address);

    twabRewards = await upgrades.deployProxy(twabRewardsFactory, [ticket.address]);

    mockRewardToken = await deployMockContract(wallet1, ERC20MintableInterface.abi);
    mockTicket = await deployMockContract(wallet1, TicketInterface.abi);
  });

  const tokensPerEpoch: BigNumber = toWei("10000");
  const epochDuration: number = 604800; // 1 week in seconds
  const numberOfEpochs: number = 12; // 3 months since 1 epoch runs for 1 week
  let promotionAmount: BigNumber;

  const createPromotion = async (
    token: Contract | MockContract = rewardToken,
    epochTokens: BigNumber = tokensPerEpoch,
    epochTimestamp: number = epochDuration,
    epochsNumber: number = numberOfEpochs,
    startTimestamp?: number
  ): Promise<any> => {
    promotionAmount = epochTokens.mul(epochsNumber);

    if (token.mock) {
      await token.mock.transferFrom
        .withArgs(wallet1.address, twabRewards.address, promotionAmount)
        .returns(promotionAmount);

      await token.mock.balanceOf.withArgs(twabRewards.address).returns(promotionAmount.sub(toWei("1")));
    } else {
      await token.mint(wallet1.address, promotionAmount);
      await token.approve(twabRewards.address, promotionAmount);
    }

    if (startTimestamp) {
      createPromotionTimestamp = startTimestamp;
    } else {
      createPromotionTimestamp = (await provider.getBlock("latest")).timestamp + 100;
    }

    return await twabRewards.createPromotion(
      token.address,
      createPromotionTimestamp,
      epochTokens,
      epochTimestamp,
      epochsNumber
    );
  };

  describe("initialize()", () => {
    it("should fail if `initialize()` method is called more than once", async () => {
      await expect(twabRewards.connect(wallet1).initialize(ticket.address)).to.be.revertedWith(
        "Initializable: contract is already initialized"
      );
    });

    it("should fail if contract is not initializing", async () => {
      await expect(twabRewards.connect(wallet1).testOnlyInitializingModifier(ticket.address)).to.be.revertedWith(
        "Initializable: contract is not initializing"
      );
    });

    it("should deploy contract", async () => {
      expect(await twabRewards.callStatic.ticket()).to.equal(ticket.address);
    });

    it("should fail to deploy contract if ticket is address zero", async () => {
      await expect(upgrades.deployProxy(twabRewardsFactory, [AddressZero])).to.be.revertedWith(
        "TwabRewards/ticket-not-zero-addr"
      );
    });

    it("should fail to deploy contract if ticket is not an actual ticket", async () => {
      const randomWallet: Wallet = Wallet.createRandom();

      await expect(upgrades.deployProxy(twabRewardsFactory, [randomWallet.address])).to.be.revertedWith(
        "TwabRewards/invalid-ticket"
      );
    });
  });

  describe("createPromotion()", async () => {
    it("should fail if a start timestamp is in the past", async () => {
      await expect(
        createPromotion(
          rewardToken,
          tokensPerEpoch,
          epochDuration,
          numberOfEpochs,
          (
            await ethers.provider.getBlock("latest")
          ).timestamp
        )
      ).to.be.revertedWith("TwabRewards/start-timestamp-is-in-the-past");
    });

    it("should create a new promotion", async () => {
      const promotionId: number = 1;

      await expect(createPromotion()).to.emit(twabRewards, "PromotionCreated").withArgs(promotionId);

      const promotion: any = await twabRewards.callStatic.getPromotion(promotionId);

      expect(promotion.creator).to.equal(wallet1.address);
      expect(promotion.token).to.equal(rewardToken.address);
      expect(promotion.tokensPerEpoch).to.equal(tokensPerEpoch);
      expect(promotion.startTimestamp).to.equal(createPromotionTimestamp);
      expect(promotion.epochDuration).to.equal(epochDuration);
      expect(promotion.numberOfEpochs).to.equal(numberOfEpochs);
      expect(promotion.rewardsUnclaimed).to.equal(tokensPerEpoch.mul(numberOfEpochs));
    });

    it("should fail to create a new promotion if reward token is a fee on transfer token", async () => {
      await expect(createPromotion(mockRewardToken)).to.be.revertedWith("TwabRewards/promo-amount-diff");
    });

    it("should fail to create a new promotion if tokens per epoch is zero", async () => {
      await expect(createPromotion(rewardToken, Zero)).to.be.revertedWith("TwabRewards/tokens-not-zero");
    });

    it("should fail to create a new promotion if epoch duration is zero", async () => {
      await expect(createPromotion(rewardToken, tokensPerEpoch, 0)).to.be.revertedWith("TwabRewards/duration-not-zero");
    });

    it("should fail to create a new promotion if number of epochs is zero", async () => {
      await expect(createPromotion(rewardToken, tokensPerEpoch, epochDuration, 0)).to.be.revertedWith(
        "TwabRewards/epochs-not-zero"
      );
    });

    it("should fail to create a new promotion if number of epochs exceeds limit", async () => {
      await expect(createPromotion(rewardToken, tokensPerEpoch, epochDuration, 256)).to.be.rejected;
    });
  });

  describe("endPromotion()", async () => {
    it("should end a promotion and transfer the correct amount of reward tokens", async () => {
      for (let index: number = 0; index < numberOfEpochs; ++index) {
        let promotionId: number = index + 1;

        await createPromotion();

        const { epochDuration, numberOfEpochs, tokensPerEpoch }: any = await twabRewards.callStatic.getPromotion(
          promotionId
        );

        if (index > 0) {
          await increaseTime(epochDuration * index + 100);
        }

        const transferredAmount: BigNumber = tokensPerEpoch.mul(numberOfEpochs).sub(tokensPerEpoch.mul(index));

        await expect(twabRewards.connect(wallet1).endPromotion(promotionId, wallet1.address))
          .to.emit(twabRewards, "PromotionEnded")
          .withArgs(promotionId, wallet1.address, transferredAmount, index);

        expect(await rewardToken.connect(wallet1).balanceOf(wallet1.address)).to.equal(transferredAmount);

        let latestEpochId: BigNumber = (await twabRewards.callStatic.getPromotion(promotionId)).numberOfEpochs;

        expect(latestEpochId).to.equal(await twabRewards.callStatic.getCurrentEpochId(promotionId));

        // We burn tokens from wallet1 to reset balance
        await rewardToken.connect(wallet1).burn(wallet1.address, transferredAmount);
      }
    });

    it("should end a promotion before it starts and transfer the full amount of reward tokens", async () => {
      const promotionId: number = 1;
      const startTimestamp: number = (await ethers.provider.getBlock("latest")).timestamp + 60;

      await createPromotion(rewardToken, tokensPerEpoch, epochDuration, numberOfEpochs, startTimestamp);

      await expect(twabRewards.connect(wallet1).endPromotion(promotionId, wallet1.address))
        .to.emit(twabRewards, "PromotionEnded")
        .withArgs(promotionId, wallet1.address, promotionAmount, 0);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet1.address)).to.equal(promotionAmount);

      expect((await twabRewards.callStatic.getPromotion(promotionId)).numberOfEpochs).to.equal(
        await twabRewards.callStatic.getCurrentEpochId(promotionId)
      );
    });

    it("should end promotion and still allow users to claim their rewards", async () => {
      const promotionId: number = 1;
      const epochNumber: number = 6;
      const epochIds: number[] = [0, 1, 2, 3, 4, 5];

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      const totalAmount: BigNumber = wallet2Amount.add(wallet3Amount);

      const wallet2ShareOfTickets: BigNumber = wallet2Amount.mul(100).div(totalAmount);
      const wallet2RewardAmount: BigNumber = wallet2ShareOfTickets.mul(tokensPerEpoch).div(100);
      const wallet2TotalRewardsAmount: BigNumber = wallet2RewardAmount.mul(epochNumber);

      const wallet3ShareOfTickets: BigNumber = wallet3Amount.mul(100).div(totalAmount);
      const wallet3RewardAmount: BigNumber = wallet3ShareOfTickets.mul(tokensPerEpoch).div(100);
      const wallet3TotalRewardsAmount: BigNumber = wallet3RewardAmount.mul(epochNumber);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet2).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);
      await ticket.connect(wallet3).delegate(wallet3.address);

      await createPromotion();

      await increaseTime(epochDuration * epochNumber + 100);

      const transferredAmount: BigNumber = tokensPerEpoch.mul(numberOfEpochs).sub(tokensPerEpoch.mul(epochNumber));

      await expect(twabRewards.connect(wallet1).endPromotion(promotionId, wallet1.address))
        .to.emit(twabRewards, "PromotionEnded")
        .withArgs(promotionId, wallet1.address, transferredAmount, epochNumber);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet1.address)).to.equal(transferredAmount);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, epochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, epochIds, wallet2.address, wallet2TotalRewardsAmount);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet2.address)).to.equal(wallet2TotalRewardsAmount);

      expect(await rewardToken.connect(wallet1).balanceOf(twabRewards.address)).to.equal(wallet3TotalRewardsAmount);
    });

    it("should end promotion and not be able to steal rewards from another promotion through destroyPromotion", async () => {
      const rewardTokenAmount: BigNumber = tokensPerEpoch.mul(numberOfEpochs);

      await createPromotion();
      await createPromotion(rewardToken, rewardTokenAmount, 10, 1);

      await expect(twabRewards.connect(wallet1).endPromotion(2, wallet1.address))
        .to.emit(twabRewards, "PromotionEnded")
        .withArgs(2, wallet1.address, rewardTokenAmount, 0);

      await increaseTime(86400 * 61); // 61 days

      await expect(twabRewards.connect(wallet1).destroyPromotion(2, wallet1.address))
        .to.emit(twabRewards, "PromotionDestroyed")
        .withArgs(2, wallet1.address, Zero);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet1.address)).to.equal(rewardTokenAmount);
      expect(await rewardToken.connect(wallet1).balanceOf(twabRewards.address)).to.equal(rewardTokenAmount);
    });

    it("should fail to end promotion if not owner", async () => {
      await createPromotion();

      await expect(twabRewards.connect(wallet2).endPromotion(1, wallet1.address)).to.be.revertedWith(
        "TwabRewards/only-promo-creator"
      );
    });

    it("should fail to end an inactive promotion", async () => {
      await createPromotion();

      await increaseTime(epochDuration * 13);

      await expect(twabRewards.connect(wallet1).endPromotion(1, wallet1.address)).to.be.revertedWith(
        "TwabRewards/promotion-inactive"
      );
    });

    it("should fail to end an inexistent promotion", async () => {
      await expect(twabRewards.connect(wallet1).endPromotion(1, wallet1.address)).to.be.revertedWith(
        "TwabRewards/invalid-promotion"
      );
    });

    it("should fail to end promotion if recipient is address zero", async () => {
      await createPromotion();

      await expect(twabRewards.connect(wallet1).endPromotion(1, AddressZero)).to.be.revertedWith(
        "TwabRewards/payee-not-zero-addr"
      );
    });
  });

  describe("destroyPromotion()", () => {
    it("should destroy a promotion and transfer the correct amount of unclaimed reward tokens", async () => {
      const promotionId: number = 1;
      const epochIds: number[] = [0, 1];

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      const totalAmount: BigNumber = wallet2Amount.add(wallet3Amount);

      const wallet2ShareOfTickets: BigNumber = wallet2Amount.mul(100).div(totalAmount);
      const wallet2RewardAmount: BigNumber = wallet2ShareOfTickets.mul(tokensPerEpoch).div(100);

      const wallet3ShareOfTickets: BigNumber = wallet3Amount.mul(100).div(totalAmount);
      const wallet3RewardAmount: BigNumber = wallet3ShareOfTickets.mul(tokensPerEpoch).div(100);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet2).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);
      await ticket.connect(wallet3).delegate(wallet3.address);

      await createPromotion();

      await increaseTime(epochDuration * 2 + 100);

      await twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, epochIds);
      await twabRewards.connect(wallet1).claimRewards(wallet3.address, promotionId, epochIds);

      await increaseTime(epochDuration * 10 + 5184000);

      const transferredAmount: BigNumber = tokensPerEpoch
        .mul(numberOfEpochs)
        .sub(wallet2RewardAmount.add(wallet3RewardAmount).mul(2));

      await expect(twabRewards.connect(wallet1).destroyPromotion(promotionId, wallet1.address))
        .to.emit(twabRewards, "PromotionDestroyed")
        .withArgs(promotionId, wallet1.address, transferredAmount);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet1.address)).to.equal(transferredAmount);
    });

    it("should fail if recipient is address zero", async () => {
      await createPromotion();

      await expect(twabRewards.connect(wallet1).destroyPromotion(1, AddressZero)).to.be.revertedWith(
        "TwabRewards/payee-not-zero-addr"
      );
    });

    it("should fail if not creator", async () => {
      await createPromotion();

      await expect(twabRewards.connect(wallet2).destroyPromotion(1, wallet1.address)).to.be.revertedWith(
        "TwabRewards/only-promo-creator"
      );
    });

    it("should fail if promotion is still active", async () => {
      await createPromotion();

      await expect(twabRewards.connect(wallet1).destroyPromotion(1, wallet1.address)).to.be.revertedWith(
        "TwabRewards/grace-period-active"
      );
    });

    it("should fail if trying to destroy a promotion that was just created", async () => {
      await createPromotion(rewardToken, tokensPerEpoch, epochDuration, numberOfEpochs);

      await expect(twabRewards.connect(wallet1).destroyPromotion(1, wallet1.address)).to.be.revertedWith(
        "TwabRewards/grace-period-active"
      );
    });
  });

  describe("extendPromotion()", async () => {
    it("should extend a promotion", async () => {
      await createPromotion();

      const numberOfEpochsAdded: number = 6;
      const extendedPromotionAmount: BigNumber = tokensPerEpoch.mul(numberOfEpochsAdded);
      const extendedPromotionEpochs: number = numberOfEpochs + numberOfEpochsAdded;

      await rewardToken.connect(wallet1).mint(wallet1.address, extendedPromotionAmount);
      await rewardToken.connect(wallet1).approve(twabRewards.address, extendedPromotionAmount);

      const promotionId: number = 1;

      await expect(twabRewards.connect(wallet1).extendPromotion(promotionId, numberOfEpochsAdded))
        .to.emit(twabRewards, "PromotionExtended")
        .withArgs(promotionId, numberOfEpochsAdded);

      expect((await twabRewards.callStatic.getPromotion(promotionId)).numberOfEpochs).to.equal(extendedPromotionEpochs);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet1.address)).to.equal(0);
      expect(await rewardToken.connect(wallet1).balanceOf(twabRewards.address)).to.equal(
        promotionAmount.add(extendedPromotionAmount)
      );
    });

    it("should fail to extend an inactive promotion", async () => {
      await createPromotion();

      await increaseTime(epochDuration * 13);

      await expect(twabRewards.connect(wallet1).extendPromotion(1, 6)).to.be.revertedWith(
        "TwabRewards/promotion-inactive"
      );
    });

    it("should fail to extend a promotion by zero epochs", async () => {
      await expect(twabRewards.connect(wallet1).extendPromotion(1, 0)).to.be.revertedWith(
        "TwabRewards/epochs-not-zero"
      );
    });

    it("should fail to extend an inexistent promotion", async () => {
      await expect(twabRewards.connect(wallet1).extendPromotion(1, 6)).to.be.revertedWith(
        "TwabRewards/invalid-promotion"
      );
    });

    it("should fail to extend a promotion over the epochs limit", async () => {
      await createPromotion();

      await expect(twabRewards.connect(wallet1).extendPromotion(1, 244)).to.be.revertedWith(
        "TwabRewards/epochs-over-limit"
      );
    });
  });

  describe("getPromotion()", async () => {
    it("should get promotion by id", async () => {
      await createPromotion();

      const promotion: any = await twabRewards.callStatic.getPromotion(1);

      expect(promotion.creator).to.equal(wallet1.address);
      expect(promotion.token).to.equal(rewardToken.address);
      expect(promotion.tokensPerEpoch).to.equal(tokensPerEpoch);
      expect(promotion.startTimestamp).to.equal(createPromotionTimestamp);
      expect(promotion.epochDuration).to.equal(epochDuration);
      expect(promotion.numberOfEpochs).to.equal(numberOfEpochs);
    });

    it("should revert if promotion id does not exist", async () => {
      await expect(twabRewards.callStatic.getPromotion(1)).to.be.revertedWith("TwabRewards/invalid-promotion");
    });
  });

  describe("getRemainingRewards()", async () => {
    it("should return the correct amount of reward tokens left", async () => {
      await createPromotion();

      const promotionId: number = 1;
      const { epochDuration, numberOfEpochs, tokensPerEpoch }: any = await twabRewards.callStatic.getPromotion(
        promotionId
      );

      for (let index: number = 0; index < numberOfEpochs; ++index) {
        if (index > 0) {
          await increaseTime(epochDuration + 100);
        }

        expect(await twabRewards.connect(wallet1).getRemainingRewards(promotionId)).to.equal(
          tokensPerEpoch.mul(numberOfEpochs).sub(tokensPerEpoch.mul(index))
        );
      }
    });

    it("should return 0 if promotion has ended", async () => {
      await createPromotion();

      const promotionId: number = 1;
      const { epochDuration }: any = await twabRewards.callStatic.getPromotion(promotionId);

      await increaseTime(epochDuration * 13 + 100);

      expect(await twabRewards.connect(wallet1).getRemainingRewards(promotionId)).to.equal(0);
    });
  });

  describe("getCurrentEpochId()", async () => {
    it("should get the current epoch id of a promotion", async () => {
      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      expect(await twabRewards.callStatic.getCurrentEpochId(1)).to.equal(3);
    });

    it("should return the first epoch id if the promotion has not started yet", async () => {
      const startTimestamp: number = (await ethers.provider.getBlock("latest")).timestamp + 60;

      await createPromotion(rewardToken, tokensPerEpoch, epochDuration, numberOfEpochs, startTimestamp);

      expect(await twabRewards.callStatic.getCurrentEpochId(1)).to.equal(0);
    });

    it("should return the epoch id for the current timestamp", async () => {
      await createPromotion();

      await increaseTime(epochDuration * 13 + 100);

      expect(await twabRewards.callStatic.getCurrentEpochId(1)).to.equal(13);
    });

    it("should revert if promotion id passed is inexistent", async () => {
      await expect(twabRewards.callStatic.getCurrentEpochId(1)).to.be.revertedWith("TwabRewards/invalid-promotion");
    });
  });

  describe("getRewardsAmount()", async () => {
    it("should fail if epoch IDs length is wrong", async () => {
      await expect(
        twabRewards.connect(wallet1).getRewardsAmount(wallet1.address, 1, Array(1_000 + 1).fill(1))
      ).to.be.revertedWith("TwabRewards/wrong-array-length");
    });

    it("should get rewards amount for one or more epochs", async () => {
      const promotionId: number = 1;
      const epochIds: number[] = [0, 1, 2];

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      const totalAmount: BigNumber = wallet2Amount.add(wallet3Amount);

      const wallet2ShareOfTickets: BigNumber = wallet2Amount.mul(100).div(totalAmount);
      const wallet2RewardAmount: BigNumber = wallet2ShareOfTickets.mul(tokensPerEpoch).div(100);

      const wallet3ShareOfTickets: BigNumber = wallet3Amount.mul(100).div(totalAmount);
      const wallet3RewardAmount: BigNumber = wallet3ShareOfTickets.mul(tokensPerEpoch).div(100);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet2).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);
      await ticket.connect(wallet3).delegate(wallet3.address);

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      const wallet2RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet2.address,
        promotionId,
        epochIds
      );

      wallet2RewardsAmount.map((rewardAmount: BigNumber) => {
        expect(rewardAmount).to.equal(wallet2RewardAmount);
      });

      const wallet3RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet3.address,
        promotionId,
        epochIds
      );

      wallet3RewardsAmount.map((rewardAmount: BigNumber) => {
        expect(rewardAmount).to.equal(wallet3RewardAmount);
      });
    });

    it("should decrease rewards amount if user delegate in the middle of an epoch", async () => {
      const promotionId: number = 1;
      const epochIds: number[] = [0, 1, 2];
      const halfEpoch: number = epochDuration / 2;

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      const totalAmount: BigNumber = wallet2Amount.add(wallet3Amount);

      const wallet2ShareOfTickets: BigNumber = wallet2Amount.mul(100).div(totalAmount);
      const wallet2RewardAmount: BigNumber = wallet2ShareOfTickets.mul(tokensPerEpoch).div(100);

      const wallet3ShareOfTickets: BigNumber = wallet3Amount.mul(100).div(totalAmount);
      const wallet3RewardAmount: BigNumber = wallet3ShareOfTickets.mul(tokensPerEpoch).div(100);
      const wallet3HalfRewardAmount: BigNumber = wallet3RewardAmount.div(2);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet2).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);
      await ticket.connect(wallet3).delegate(wallet3.address);

      await createPromotion();

      // We adjust time to delegate right in the middle of epoch 3
      await setTime(epochDuration * 2 + halfEpoch - 1);

      await ticket.connect(wallet3).delegate(wallet2.address);

      await increaseTime(halfEpoch);

      const wallet2RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet2.address,
        promotionId,
        epochIds
      );

      wallet2RewardsAmount.map((rewardAmount: BigNumber, index: number) => {
        if (index !== 2) {
          expect(rewardAmount).to.equal(wallet2RewardAmount);
        } else {
          expect(rewardAmount).to.equal(wallet2RewardAmount.add(wallet3HalfRewardAmount));
        }
      });

      const wallet3RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet3.address,
        promotionId,
        epochIds
      );

      wallet3RewardsAmount.map((rewardAmount: BigNumber, index: number) => {
        if (index !== 2) {
          expect(rewardAmount).to.equal(wallet3RewardAmount);
        } else {
          expect(rewardAmount).to.equal(wallet3HalfRewardAmount);
        }
      });
    });

    it("should return 0 for epochs that have already been claimed", async () => {
      const promotionId: number = 1;
      const epochIds: number[] = [0, 1, 2];
      const wallet2ClaimedEpochIds: number[] = [0, 2];
      const wallet3ClaimedEpochIds: number[] = [2];

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      const totalAmount: BigNumber = wallet2Amount.add(wallet3Amount);

      const wallet2ShareOfTickets: BigNumber = wallet2Amount.mul(100).div(totalAmount);
      const wallet2RewardAmount: BigNumber = wallet2ShareOfTickets.mul(tokensPerEpoch).div(100);

      const wallet3ShareOfTickets: BigNumber = wallet3Amount.mul(100).div(totalAmount);
      const wallet3RewardAmount: BigNumber = wallet3ShareOfTickets.mul(tokensPerEpoch).div(100);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet2).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);
      await ticket.connect(wallet3).delegate(wallet3.address);

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, wallet2ClaimedEpochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, wallet2ClaimedEpochIds, wallet2.address, wallet2RewardAmount.mul(2));

      await expect(twabRewards.connect(wallet1).claimRewards(wallet3.address, promotionId, wallet3ClaimedEpochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, wallet3ClaimedEpochIds, wallet3.address, wallet3RewardAmount);

      const wallet2RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet2.address,
        promotionId,
        epochIds
      );

      const wallet2ClaimedRewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet2.address,
        promotionId,
        wallet2ClaimedEpochIds
      );

      wallet2RewardsAmount.map((rewardAmount: BigNumber, index: number) => {
        if (index !== 1) {
          expect(rewardAmount).to.equal(Zero);
        } else {
          expect(rewardAmount).to.equal(wallet2RewardAmount);
        }
      });

      wallet2ClaimedRewardsAmount.map((rewardAmount: BigNumber) => {
        expect(rewardAmount).to.equal(Zero);
      });

      const wallet3RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet3.address,
        promotionId,
        epochIds
      );

      const wallet3ClaimedRewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(
        wallet3.address,
        promotionId,
        wallet3ClaimedEpochIds
      );

      wallet3RewardsAmount.map((rewardAmount: BigNumber, index: number) => {
        if (index !== 2) {
          expect(rewardAmount).to.equal(wallet3RewardAmount);
        } else {
          expect(rewardAmount).to.equal(Zero);
        }
      });

      wallet3ClaimedRewardsAmount.map((rewardAmount: BigNumber) => {
        expect(rewardAmount).to.equal(Zero);
      });
    });

    it("should return reward calculated on tickets delegated to user", async () => {
      const wallet2Amount: BigNumber = toWei("750");

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      const wallet2RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(wallet2.address, 1, [
        "0",
        "1",
        "2",
      ]);

      wallet2RewardsAmount.map((rewardAmount: BigNumber) => {
        expect(rewardAmount).to.equal(tokensPerEpoch);
      });
    });

    it("should return 0 if ticket average total supplies is 0", async () => {
      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      const wallet2RewardsAmount: BigNumber[] = await twabRewards.callStatic.getRewardsAmount(wallet2.address, 1, [
        "0",
        "1",
        "2",
      ]);

      wallet2RewardsAmount.map((rewardAmount: BigNumber) => {
        expect(rewardAmount).to.equal(Zero);
      });
    });

    it("should fail to get rewards amount if one or more epochs are not over yet", async () => {
      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      await expect(twabRewards.callStatic.getRewardsAmount(wallet2.address, 1, ["1", "2", "3"])).to.be.revertedWith(
        "TwabRewards/epoch-not-over"
      );
    });

    it("should fail to get rewards amount for epoch ids that does not exist", async () => {
      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);

      await createPromotion();

      await increaseTime(epochDuration * 13 + 100);

      await expect(twabRewards.callStatic.getRewardsAmount(wallet2.address, 1, ["12", "13", "14"])).to.be.revertedWith(
        "TwabRewards/invalid-epoch-id"
      );
    });

    it("should revert if promotion id passed is inexistent", async () => {
      await expect(twabRewards.callStatic.getRewardsAmount(wallet2.address, 1, ["0", "1", "2"])).to.be.revertedWith(
        "TwabRewards/invalid-promotion"
      );
    });
  });

  describe("claimRewards()", async () => {
    it("should fail if epoch IDs length is wrong", async () => {
      await expect(
        twabRewards.connect(wallet1).claimRewards(wallet1.address, 1, Array(1_000 + 1).fill(1))
      ).to.be.revertedWith("TwabRewards/wrong-array-length");
    });

    it("should claim rewards for one or more epochs", async () => {
      const promotionId: number = 1;
      const epochNumber: number = 3;
      const epochIds: number[] = [0, 1, 2];

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      const totalAmount: BigNumber = wallet2Amount.add(wallet3Amount);

      const wallet2ShareOfTickets: BigNumber = wallet2Amount.mul(100).div(totalAmount);
      const wallet2RewardAmount: BigNumber = wallet2ShareOfTickets.mul(tokensPerEpoch).div(100);
      const wallet2TotalRewardsAmount: BigNumber = wallet2RewardAmount.mul(epochNumber);

      const wallet3ShareOfTickets: BigNumber = wallet3Amount.mul(100).div(totalAmount);
      const wallet3RewardAmount: BigNumber = wallet3ShareOfTickets.mul(tokensPerEpoch).div(100);
      const wallet3TotalRewardsAmount: BigNumber = wallet3RewardAmount.mul(epochNumber);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet2).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);
      await ticket.connect(wallet3).delegate(wallet3.address);

      await createPromotion();

      await increaseTime(epochDuration * epochNumber + 100);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, epochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, epochIds, wallet2.address, wallet2TotalRewardsAmount);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet3.address, promotionId, epochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, epochIds, wallet3.address, wallet3TotalRewardsAmount);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet2.address)).to.equal(wallet2TotalRewardsAmount);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet3.address)).to.equal(wallet3TotalRewardsAmount);
    });

    it("should decrease rewards amount claimed if user delegate in the middle of an epoch", async () => {
      const promotionId: number = 1;
      const epochNumber: number = 3;
      const epochIds: number[] = [0, 1, 2];
      const halfEpoch: number = epochDuration / 2;

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      const totalAmount: BigNumber = wallet2Amount.add(wallet3Amount);

      const wallet3ShareOfTickets: BigNumber = wallet3Amount.mul(100).div(totalAmount);
      const wallet3RewardAmount: BigNumber = wallet3ShareOfTickets.mul(tokensPerEpoch).div(100);
      const wallet3HalfRewardAmount: BigNumber = wallet3RewardAmount.div(2);
      const wallet3TotalRewardsAmount: BigNumber = wallet3RewardAmount.mul(epochNumber).sub(wallet3HalfRewardAmount);

      const wallet2ShareOfTickets: BigNumber = wallet2Amount.mul(100).div(totalAmount);
      const wallet2RewardAmount: BigNumber = wallet2ShareOfTickets.mul(tokensPerEpoch).div(100);
      const wallet2TotalRewardsAmount: BigNumber = wallet2RewardAmount.mul(epochNumber).add(wallet3HalfRewardAmount);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet2).delegate(wallet2.address);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);
      await ticket.connect(wallet3).delegate(wallet3.address);

      await createPromotion();

      // We adjust time to delegate right in the middle of epoch 3
      await setTime(epochDuration * 2 + halfEpoch - 1);

      await ticket.connect(wallet3).delegate(wallet2.address);

      await increaseTime(halfEpoch);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, epochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, epochIds, wallet2.address, wallet2TotalRewardsAmount);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet3.address, promotionId, epochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, epochIds, wallet3.address, wallet3TotalRewardsAmount);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet2.address)).to.equal(wallet2TotalRewardsAmount);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet3.address)).to.equal(wallet3TotalRewardsAmount);
    });

    it("should claim rewards calculated on  user tickets delegated to him", async () => {
      const promotionId: number = 1;
      const epochIds: number[] = [0, 1, 2];
      const wallet2Amount: BigNumber = toWei("750");
      const rewardPer3Epoch: BigNumber = tokensPerEpoch.mul(3);

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, epochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, epochIds, wallet2.address, rewardPer3Epoch);

      expect(await rewardToken.connect(wallet1).balanceOf(wallet2.address)).to.equal(rewardPer3Epoch);
    });

    it("should return 0 if ticket average total supplies is 0", async () => {
      const promotionId: number = 1;
      const epochIds: number[] = [0, 1, 2];

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, epochIds))
        .to.emit(twabRewards, "RewardsClaimed")
        .withArgs(promotionId, epochIds, wallet2.address, Zero);
    });

    it("should fail to claim rewards for an inexistent promotion", async () => {
      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, 1, ["0", "1", "2"])).to.be.revertedWith(
        "TwabRewards/invalid-promotion"
      );
    });

    it("should fail to claim rewards if one or more epochs are not over yet", async () => {
      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, 1, ["1", "2", "3"])).to.be.revertedWith(
        "TwabRewards/epoch-not-over"
      );
    });

    it("should fail to claim rewards if one or more epochs have already been claimed", async () => {
      const promotionId: number = 1;

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);

      await createPromotion();

      await increaseTime(epochDuration * 3 + 100);

      await twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, ["0", "1", "2"]);

      await expect(
        twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, ["2", "3", "4"])
      ).to.be.revertedWith("TwabRewards/rewards-claimed");
    });

    it("should fail to claim rewards for epoch ids that does not exist", async () => {
      const promotionId: number = 1;

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);

      await createPromotion();

      await increaseTime(epochDuration * 13 + 100);

      await expect(
        twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, ["12", "13", "14"])
      ).to.be.revertedWith("TwabRewards/invalid-epoch-id");
    });

    it("should fail to claim rewards past 255", async () => {
      const promotionId: number = 1;

      const wallet2Amount: BigNumber = toWei("750");
      const wallet3Amount: BigNumber = toWei("250");

      await ticket.connect(wallet1).mint(wallet2.address, wallet2Amount);
      await ticket.connect(wallet1).mint(wallet3.address, wallet3Amount);

      await createPromotion(rewardToken, tokensPerEpoch, epochDuration, 255);

      await increaseTime(epochDuration * 256);

      await expect(twabRewards.connect(wallet1).claimRewards(wallet2.address, promotionId, ["256"])).to.be.rejected;
    });
  });

  describe("_requireTicket()", () => {
    it("should revert if ticket address is address zero", async () => {
      await expect(twabRewards.connect(wallet1).requireTicket(AddressZero)).to.be.revertedWith(
        "TwabRewards/ticket-not-zero-addr"
      );
    });

    it("should revert if controller does not exist", async () => {
      const randomWallet: Wallet = Wallet.createRandom();

      await expect(twabRewards.connect(wallet1).requireTicket(randomWallet.address)).to.be.revertedWith(
        "TwabRewards/invalid-ticket"
      );
    });

    it("should revert if controller address is address zero", async () => {
      await mockTicket.mock.controller.returns(AddressZero);

      await expect(twabRewards.connect(wallet1).requireTicket(mockTicket.address)).to.be.revertedWith(
        "TwabRewards/invalid-ticket"
      );
    });
  });

  describe("_isClaimedEpoch()", () => {
    it("should return true for a claimed epoch", async () => {
      expect(await twabRewards.callStatic.isClaimedEpoch("01100111", 2)).to.equal(true);
    });

    it("should return false for an unclaimed epoch", async () => {
      expect(await twabRewards.callStatic.isClaimedEpoch("01100011", 2)).to.equal(false);
    });
  });
});
