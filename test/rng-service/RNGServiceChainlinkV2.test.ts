import { anyUint } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

import { BigNumber, Contract, ContractFactory, Transaction } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { getEvents as getEventsHelper } from "./helpers/getEvents";

import { deployMockContract, MockContract } from "ethereum-waffle";

import { TransactionResponse } from "@ethersproject/providers";

import { artifacts, ethers, upgrades } from "hardhat";

import { LogDescription } from "@ethersproject/abi";

import { Artifact } from "hardhat/types";

import { expect } from "chai";

const { constants, getContractFactory, getSigners, provider, utils } = ethers;
const { formatBytes32String } = utils;
const { AddressZero } = constants;

const getEvents = (tx: Transaction, contract: Contract): Promise<(LogDescription | undefined)[]> =>
  getEventsHelper(provider, tx, contract);

const debug = require("debug")("ptv3:RNGServiceChainlinkV2.test");

type deployParametersType = {
  deployerAddress: string;
  vrfCoordinatorAddress: string;
  subscriptionId: number;
  keyHash: string;
};

describe("RNGServiceChainlinkV2", function () {
  let deployer: SignerWithAddress;
  let manager: SignerWithAddress;
  let stranger: SignerWithAddress;

  let vrfCoordinator: Contract;
  let blockStore: Contract;
  let rngService: Contract;
  let link: Contract;

  let isDeployTest: boolean = false;

  // Ethereum Mainnet 200 Gwei keyHash
  const keyHash: string = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";

  let deployParameters: deployParametersType;

  const deployRNGServiceChainlinkV2 = async ({
    deployerAddress,
    vrfCoordinatorAddress,
    subscriptionId,
    keyHash,
  }: deployParametersType): Promise<Contract> => {
    const RNGServiceChainlinkV2HarnessFactory: ContractFactory = await getContractFactory(
      "RNGServiceChainlinkV2Harness",
      deployer
    );

    return await upgrades.deployProxy(RNGServiceChainlinkV2HarnessFactory, [
      deployerAddress,
      vrfCoordinatorAddress,
      subscriptionId,
      keyHash,
    ]);
  };

  beforeEach(async () => {
    [deployer, manager, stranger] = await getSigners();

    debug("Deploying LINK...");

    const LinkFactory: ContractFactory = await getContractFactory("LinkToken", deployer);

    link = await LinkFactory.deploy();

    debug("Deploying AggregatorV3 mock contract...");

    const Aggregator: Artifact = await artifacts.readArtifact("AggregatorV3Interface");
    const aggregatorV3Mock: MockContract = await deployMockContract(deployer, Aggregator.abi);

    debug("Deploying BlockStore...");

    const BlockStoreFactory: ContractFactory = await getContractFactory("BlockhashStoreTestHelper", deployer);

    blockStore = await BlockStoreFactory.deploy();

    debug("Deploying RNGService...");

    const VRFCoordinatorFactory: ContractFactory = await getContractFactory("VRFCoordinatorV2", deployer);

    vrfCoordinator = await VRFCoordinatorFactory.deploy(link.address, aggregatorV3Mock.address, blockStore.address);

    // Dummy values to test random numbers generation
    await vrfCoordinator.setConfig(3, 1000000, 60, 0, 1, {
      fulfillmentFlatFeeLinkPPMTier1: 0,
      fulfillmentFlatFeeLinkPPMTier2: 0,
      fulfillmentFlatFeeLinkPPMTier3: 0,
      fulfillmentFlatFeeLinkPPMTier4: 0,
      fulfillmentFlatFeeLinkPPMTier5: 0,
      reqsForTier2: 0,
      reqsForTier3: 0,
      reqsForTier4: 0,
      reqsForTier5: 0,
    });

    deployParameters = {
      deployerAddress: deployer.address,
      vrfCoordinatorAddress: vrfCoordinator.address,
      subscriptionId: 1,
      keyHash,
    };

    if (!isDeployTest) {
      rngService = await deployRNGServiceChainlinkV2(deployParameters);

      await rngService.setManager(manager.address);
    }
  });

  describe("initialize()", () => {
    beforeEach(async () => {
      isDeployTest = true;
    });

    afterEach(async () => {
      isDeployTest = false;
    });

    it("should fail if `initialize()` method is called more than once", async () => {
      const rngService: Contract = await deployRNGServiceChainlinkV2(deployParameters);

      await expect(
        rngService.connect(deployer).initialize(deployer.address, vrfCoordinator.address, 1, keyHash)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should fail if contract is not initializing", async () => {
      const rngService: Contract = await deployRNGServiceChainlinkV2(deployParameters);

      await expect(
        rngService
          .connect(deployer)
          ["testOnlyInitializingModifier(address,address,uint64,bytes32)"](
            deployer.address,
            vrfCoordinator.address,
            1,
            keyHash
          )
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if contract is not initializing", async () => {
      const rngService: Contract = await deployRNGServiceChainlinkV2(deployParameters);

      await expect(
        rngService
          .connect(deployer)
          ["testOnlyInitializingModifier(address,uint64,bytes32)"](vrfCoordinator.address, 1, keyHash)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should fail if contract is not initializing", async () => {
      const rngService: Contract = await deployRNGServiceChainlinkV2(deployParameters);

      await expect(
        rngService.connect(deployer)["testOnlyInitializingModifier(address)"](vrfCoordinator.address)
      ).to.be.revertedWith("Initializable: contract is not initializing");
    });

    it("should deploy RNGServiceChainlinkV2", async () => {
      const rngService: Contract = await deployRNGServiceChainlinkV2(deployParameters);
      const deployTransaction: TransactionResponse = rngService.deployTransaction;
      const { deployerAddress, vrfCoordinatorAddress, subscriptionId, keyHash } = deployParameters;

      await expect(deployTransaction).to.emit(rngService, "KeyHashSet").withArgs(keyHash);
      await expect(deployTransaction).to.emit(rngService, "SubscriptionIdSet").withArgs(subscriptionId);
      await expect(deployTransaction).to.emit(rngService, "VrfCoordinatorSet").withArgs(vrfCoordinatorAddress);

      expect(await rngService.owner()).to.equal(deployerAddress);
      expect(await rngService.getKeyHash()).to.equal(keyHash);
      expect(await rngService.getSubscriptionId()).to.equal(subscriptionId);
      expect(await rngService.getVrfCoordinator()).to.equal(vrfCoordinatorAddress);
    });

    it("should fail to deploy RNGServiceChainlinkV2 if vrfCoordinator is address zero", async () => {
      deployParameters.vrfCoordinatorAddress = AddressZero;

      await expect(deployRNGServiceChainlinkV2(deployParameters)).to.be.revertedWith(
        "RNGServiceChainlinkV2/vrf-coordinator-not-zero-addr"
      );
    });

    it("should fail to deploy RNGServiceChainlinkV2 if subscriptionId is not greater than zero", async () => {
      deployParameters.subscriptionId = 0;

      await expect(deployRNGServiceChainlinkV2(deployParameters)).to.be.revertedWith(
        "RNGServiceChainlinkV2/subscriptionId-gt-zero"
      );
    });

    it("should fail to deploy RNGServiceChainlinkV2 if keyHash is an empty bytes32 string", async () => {
      deployParameters.keyHash = formatBytes32String("");

      await expect(deployRNGServiceChainlinkV2(deployParameters)).to.be.revertedWith(
        "RNGServiceChainlinkV2/keyHash-not-empty"
      );
    });
  });

  describe("requestRandomNumbers()", () => {
    it("should request one random number", async () => {
      await rngService.subscribe();

      const numWords: BigNumber = BigNumber.from(1);
      const transaction: Transaction = await rngService.connect(manager).requestRandomNumbers(numWords);
      const requestId: BigNumber = await rngService.callStatic.getLastRequestId();

      await expect(transaction)
        .to.emit(rngService, "RandomNumbersRequested")
        .withArgs(requestId, anyUint, numWords, manager.address);

      // Confirm delayed completion
      expect(await rngService.isRequestCompleted(requestId)).to.equal(false);
    });

    it("should return the correct data", async () => {
      await rngService.subscribe();

      const numWords: BigNumber = BigNumber.from(1);
      const blockNumber: number = (await provider.getBlock("latest")).number;
      const returnData: any = await rngService.connect(manager).callStatic.requestRandomNumbers(numWords);

      await rngService.connect(manager).requestRandomNumbers(numWords);

      expect(returnData["requestId"]).to.equal(await rngService.callStatic.getLastRequestId());
      expect(returnData["lockBlock"]).to.equal(blockNumber);
    });

    it("should fail to request a random numbers if the subscription ID is invalid", async () => {
      await expect(rngService.connect(manager).requestRandomNumbers(BigNumber.from(1))).to.be.revertedWithCustomError(
        vrfCoordinator,
        "InvalidSubscription"
      );
    });

    it("should fail to request a random numbers if not manager", async () => {
      await expect(rngService.requestRandomNumbers(BigNumber.from(1))).to.be.revertedWith(
        "Manageable/caller-not-manager"
      );
    });
  });

  describe("rawFulfillRandomWords()", () => {
    it("should fail if not VRF Coordinator is trying to raw fulfill random words", async () => {
      await expect(rngService.connect(deployer).rawFulfillRandomWords(BigNumber.from(1), []))
        .to.be.revertedWithCustomError(rngService, "OnlyCoordinatorCanFulfill")
        .withArgs(deployer.address, vrfCoordinator.address);
    });

    it("should raw fulfill random words by VRF Coordinator", async () => {
      const newDeployParameters: deployParametersType = deployParameters;

      newDeployParameters.vrfCoordinatorAddress = deployer.address;

      const rngService: Contract = await deployRNGServiceChainlinkV2(newDeployParameters);

      await expect(
        rngService.connect(deployer).rawFulfillRandomWords(BigNumber.from(1), [BigNumber.from(666)])
      ).to.be.revertedWith("RNGServiceChainlinkV2/requestId-incorrect");
    });
  });

  describe("fulfillRandomWords()", () => {
    it("should fulfill a random numbers request", async () => {
      await rngService.subscribe();

      const numWords: BigNumber = BigNumber.from(1);
      const returnData: any = await rngService.connect(manager).callStatic.requestRandomNumbers(numWords);
      const requestRandomNumberTransaction: Transaction = await rngService
        .connect(manager)
        .requestRandomNumbers(numWords);

      const events: (LogDescription | undefined)[] = await getEvents(requestRandomNumberTransaction, vrfCoordinator);
      const event: LogDescription | undefined = events.find(
        (event: LogDescription | undefined) => event && event.name === "RandomWordsRequested"
      );

      if (event) {
        const requestId: BigNumber = event.args["requestId"];
        const internalRequestId: BigNumber = returnData["requestId"];

        expect(await rngService.isRequestCompleted(internalRequestId)).to.equal(false);

        const randomNumber: number = Math.floor(Math.random() * 1000);
        const fulfillRandomWordsTransaction: Transaction = await rngService.rawFulfillRandomWordsStub(requestId, [
          randomNumber,
        ]);

        expect(fulfillRandomWordsTransaction)
          .to.emit(rngService, "RandomNumbersCompleted")
          .withArgs(internalRequestId, [randomNumber]);
        expect(await rngService.callStatic.isRequestCompleted(internalRequestId)).to.equal(true);
        expect(await rngService.callStatic.getRandomNumbers(internalRequestId)).to.deep.equal([
          BigNumber.from(randomNumber),
        ]);
      }
    });

    it("should fail to fulfill a random numbers request if requestId is incorrect", async () => {
      await rngService.subscribe();
      await rngService.connect(manager).requestRandomNumbers(BigNumber.from(1));

      const randomNumber: number = Math.floor(Math.random() * 1000);

      await expect(rngService.rawFulfillRandomWordsStub(1, [randomNumber])).to.be.revertedWith(
        "RNGServiceChainlinkV2/requestId-incorrect"
      );
    });
  });

  describe("getRandomNumbers()", () => {
    it("should return the latest generated random numbers list", async () => {
      await rngService.subscribe();

      const numWords: BigNumber = BigNumber.from(1);
      const returnData: any = await rngService.connect(manager).callStatic.requestRandomNumbers(numWords);
      const requestRandomNumberTransaction: Transaction = await rngService
        .connect(manager)
        .requestRandomNumbers(numWords);

      const events: (LogDescription | undefined)[] = await getEvents(requestRandomNumberTransaction, vrfCoordinator);
      const event: LogDescription | undefined = events.find(
        (event: LogDescription | undefined) => event && event.name === "RandomWordsRequested"
      );

      if (event) {
        const requestId: BigNumber = event.args["requestId"];
        const internalRequestId: BigNumber = returnData["requestId"];
        const randomNumber: number = Math.floor(Math.random() * 1000);

        await rngService.rawFulfillRandomWordsStub(requestId, [randomNumber]);

        expect(await rngService.callStatic.getRandomNumbers(internalRequestId)).to.deep.equal([randomNumber]);
      }
    });
  });

  describe("getLastRequestId()", () => {
    it("should return the next unused request ID", async () => {
      await rngService.setRequestCounter(123);

      expect(await rngService.getLastRequestId()).to.equal(123);
    });
  });

  describe("getRequestFee()", () => {
    it("should return the fee for a request", async () => {
      const feeData: any = await rngService.getRequestFee();

      expect(feeData.feeToken).to.equal(AddressZero);
      expect(feeData.requestFee).to.equal(0);
    });
  });

  describe("getKeyHash()", () => {
    it("should get Chainlink VRF keyHash", async () => {
      expect(await rngService.getKeyHash()).to.equal(deployParameters.keyHash);
    });
  });

  describe("getSubscriptionId()", () => {
    it("should get Chainlink VRF subscription ID", async () => {
      expect(await rngService.getSubscriptionId()).to.equal(1);
    });
  });

  describe("getVrfCoordinator()", () => {
    it("should get Chainlink VRF Coordinator address", async () => {
      expect(await rngService.getVrfCoordinator()).to.equal(vrfCoordinator.address);
    });
  });

  describe("setSubscriptionId()", () => {
    it("should succeed to set subscription id if owner", async () => {
      const { subscriptionId } = deployParameters;

      await expect(rngService.setSubscriptionId(subscriptionId))
        .to.emit(rngService, "SubscriptionIdSet")
        .withArgs(subscriptionId);
    });

    it("should fail to set subscription id if subscriptionId is not greater than zero", async () => {
      deployParameters.subscriptionId = 0;

      await expect(rngService.setSubscriptionId(deployParameters.subscriptionId)).to.be.revertedWith(
        "RNGServiceChainlinkV2/subscriptionId-gt-zero"
      );
    });

    it("should fail to set subscription id if not owner", async () => {
      await expect(rngService.connect(stranger).setSubscriptionId(deployParameters.subscriptionId)).to.be.revertedWith(
        "Ownable/caller-not-owner"
      );
    });
  });

  describe("setKeyHash()", () => {
    it("should succeed to set keyHash if owner", async () => {
      await expect(rngService.setKeyHash(keyHash)).to.emit(rngService, "KeyHashSet").withArgs(keyHash);
    });

    it("should fail to set keyHash if keyHash is an empty bytes32 string", async () => {
      deployParameters.keyHash = formatBytes32String("");

      await expect(rngService.setKeyHash(deployParameters.keyHash)).to.be.revertedWith(
        "RNGServiceChainlinkV2/keyHash-not-empty"
      );
    });

    it("should fail to set keyHash if not owner", async () => {
      await expect(rngService.connect(stranger).setKeyHash(keyHash)).to.be.revertedWith("Ownable/caller-not-owner");
    });
  });
});
