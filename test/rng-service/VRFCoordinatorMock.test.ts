import { BigNumber, Contract, ContractFactory, constants } from "ethers";

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ethers, upgrades } from "hardhat";

import { expect } from "chai";

const { getContractFactory, getSigners }: any = ethers;

describe("VRFCoordinatorMock", function () {
  let wallet1: SignerWithAddress;

  let RNGServiceChainlinkV2HarnessFactory: ContractFactory;
  let VRFCoordinatorFactory: ContractFactory;

  let vrfCoordinator: Contract;
  let rngService: Contract;

  // Ethereum Mainnet 200 Gwei keyHash
  const keyHash: string = "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef";
  const subscriptionId: number = 1;
  const requestConfirmationsNumber: number = 3;
  const callbackGasLimit: number = 2500000;

  beforeEach(async () => {
    [wallet1] = await getSigners();

    VRFCoordinatorFactory = await getContractFactory("VRFCoordinatorMock", wallet1);
    vrfCoordinator = await upgrades.deployProxy(VRFCoordinatorFactory, []);

    RNGServiceChainlinkV2HarnessFactory = await getContractFactory("RNGServiceChainlinkV2Harness", wallet1);
    rngService = await upgrades.deployProxy(RNGServiceChainlinkV2HarnessFactory, [
      wallet1.address,
      vrfCoordinator.address,
      subscriptionId,
      keyHash,
    ]);

    await rngService.setManager(wallet1.address);
  });

  describe("randomNumbersCounter()", () => {
    it("should return proper total random numbers count", async () => {
      expect(await vrfCoordinator.connect(wallet1).randomNumbersCounter()).to.be.equal(BigNumber.from(0));
    });
  });

  describe("requestsCounter()", () => {
    it("should return proper total requests count", async () => {
      expect(await vrfCoordinator.connect(wallet1).requestsCounter()).to.be.equal(BigNumber.from(0));
    });
  });

  describe("getRequestConfig()", () => {
    it("should return proper request config", async () => {
      const requestConfig: any = await vrfCoordinator.connect(wallet1).getRequestConfig();

      expect(requestConfig[0]).to.be.equal(requestConfirmationsNumber);
      expect(requestConfig[1]).to.be.equal(callbackGasLimit);
      expect(requestConfig[2]).to.be.deep.equal([
        "0xff8dedfbfa60af186cf3c830acbc32c05aae823045ae5ea7da1e45fbfaba4f92",
        "0x9fe0eebf5e446e3c998ec9bb19951541aee00bb90ea201ae456421a2ded86805",
        "0x8b15aa058056a19f94f93564b50b7bf0764f89634f21546869048e173928891e",
        "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef",
      ]);
    });
  });

  describe("getRequest()", () => {
    it("should return proper request info", async () => {
      const request: any = await vrfCoordinator.connect(wallet1).getRequest(BigNumber.from(0));

      expect(request.requester).to.be.equal(constants.AddressZero);
      expect(request.randomness).to.be.deep.equal([]);
    });
  });

  describe("requestRandomWords()", () => {
    it("should request random numbers", async () => {
      await rngService.connect(wallet1).requestRandomNumbers(3);
      await vrfCoordinator.connect(wallet1).fulfill(BigNumber.from(1));

      const request: any = await vrfCoordinator.connect(wallet1).getRequest(BigNumber.from(1));

      expect(request.requester).to.be.equal(rngService.address);
      expect(request.randomness.length).to.be.equal(3);

      expect((await rngService.connect(wallet1).getRandomNumbers(BigNumber.from(1))).length).to.be.equal(3);
    });
  });
});
