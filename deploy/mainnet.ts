import { getFirstLidoRebaseTimestamp } from "../scripts/helpers/getFirstLidoRebaseTimestamp";

import { setPrizeDistributor } from "../src/setPrizeDistributor";
import { deployAndVerify } from "../src/deployAndVerify";
import { setPrizeFlush } from "../src/setPrizeFlush";
import { setDrawBeacon } from "../src/setDrawBeacon";
import { setManager } from "../src/setManager";
import { setTicket } from "../src/setTicket";
import {
  PRIZE_DISTRIBUTION_FACTORY_MINIMUM_PICK_COST,
  PRIZE_DISTRIBUTION_BUFFER_CARDINALITY,
  DRAW_BUFFER_CARDINALITY,
  BEACON_PERIOD_SECONDS,
  END_TIMESTAMP_OFFSET,
  TOKEN_DECIMALS,
} from "../src/constants";

import { HardhatRuntimeEnvironment } from "hardhat/types";

import { BigNumber, Contract } from "ethers";

import { dim } from "chalk";

export default async function deployToMainnet(hardhat: HardhatRuntimeEnvironment) {
  if (process.env.DEPLOY === "v1.0.0.mainnet") {
    dim(`Deploying: Ethereum Mainnet`);
    dim(`Version: 1.0.0`);
  } else {
    return;
  }

  const { getNamedAccounts, ethers } = hardhat;
  const { deployer, defenderRelayer } = await getNamedAccounts();

  // ===================================================
  //                 Deploy Contracts                 //
  // ===================================================

  const asx: Contract = await deployAndVerify(
    "ASX",
    [
      process.env.ASX_NAME?.trim() || "Asymetrix Governance Token",
      process.env.ASX_SYMBOL?.trim() || "ASX",
      BigNumber.from(process.env.ASX_CAP?.trim() || ethers.utils.parseEther("100000000")),
      process.env.ASX_INITIAL_SUPPLY_RECEIVER?.trim() || deployer,
    ],
    false
  );

  const stakePrizePoolResult: Contract = await deployAndVerify(
    "StakePrizePool",
    [
      deployer,
      process.env.STAKE_TOKEN?.trim(),
      asx.address,
      BigNumber.from(process.env.REWARD_PER_SECOND?.trim() || ethers.utils.parseEther("10000000")),
      BigNumber.from(process.env.MAX_CLAIM_INTERVAL?.trim() || "604800"),
      BigNumber.from(process.env.CLAIM_INTERVAL?.trim() || "86400"),
      BigNumber.from(process.env.FREE_EXIT_DURATION?.trim() || "7200"),
      getFirstLidoRebaseTimestamp(),
      BigNumber.from(process.env.LIDO_APR?.trim() || "550"),
    ],
    false
  );

  const ticketResult: Contract = await deployAndVerify(
    "Ticket",
    [
      process.env.TICKET_NAME?.trim() || "Pool Share Token",
      process.env.TICKET_SYMBOL?.trim() || "PST",
      TOKEN_DECIMALS,
      stakePrizePoolResult.address,
    ],
    false
  );

  const drawBufferResult: Contract = await deployAndVerify("DrawBuffer", [deployer, DRAW_BUFFER_CARDINALITY], false);

  const prizeDistributionBufferResult: Contract = await deployAndVerify(
    "PrizeDistributionBuffer",
    [deployer, PRIZE_DISTRIBUTION_BUFFER_CARDINALITY],
    false
  );

  await deployAndVerify(
    "DrawCalculator",
    [ticketResult.address, drawBufferResult.address, prizeDistributionBufferResult.address],
    false
  );

  const rngServiceChainlinkV2Result: Contract = await deployAndVerify(
    "RNGServiceChainlinkV2",
    [
      deployer,
      process.env.VRF_COORDINATOR?.trim() || "0x271682deb8c4e0901d1a1550ad2e64d568e69909",
      BigNumber.from(process.env.SUBSCRIPTION_ID?.trim() || "0"),
      process.env.KEY_HASH?.trim() || "0x9fe0eebf5e446e3c998ec9bb19951541aee00bb90ea201ae456421a2ded86805",
    ],
    false
  );

  const prizeDistributorResult: Contract = await deployAndVerify(
    "PrizeDistributor",
    [
      deployer,
      ticketResult.address,
      drawBufferResult.address,
      prizeDistributionBufferResult.address,
      rngServiceChainlinkV2Result.address,
      process.env.DISTRIBUTION ? process.env.DISTRIBUTION.trim().split(",") : ["10000"],
      BigNumber.from(process.env.RNG_TIMEOUT?.trim() || "7200"),
    ],
    false
  );

  const reserveResult: Contract = await deployAndVerify("Reserve", [deployer, ticketResult.address], false);

  const drawCalculatorTimelockResult: Contract = await deployAndVerify("DrawCalculatorTimelock", [deployer], false);

  await deployAndVerify("EIP2612PermitAndDeposit", [], false);

  await deployAndVerify("TwabRewards", [ticketResult.address], false);

  await deployAndVerify(
    "TWABDelegator",
    [
      ticketResult.address,
      BigNumber.from(process.env.MIN_LOCK_DURATION?.trim() || "86400"),
      BigNumber.from(process.env.MAX_LOCK_DURATION?.trim() || "15552000"),
    ],
    false,
    {
      initializer: "initialize(address,uint96,uint96)",
      unsafeAllow: ["delegatecall"],
    }
  );

  // New draw every 1 week
  const extraTime = 0; // 0 seconds
  const beaconPeriodStart = parseInt("" + (new Date().getTime() / 1000 + extraTime)); // current time + extra time

  const drawBeaconResult: Contract = await deployAndVerify(
    "DrawBeacon",
    [
      deployer,
      drawBufferResult.address,
      1, // DrawID
      beaconPeriodStart,
      BEACON_PERIOD_SECONDS,
    ],
    false
  );

  const prizeDistributionFactoryResult: Contract = await deployAndVerify(
    "PrizeDistributionFactory",
    [
      deployer,
      drawBufferResult.address,
      prizeDistributionBufferResult.address,
      drawBeaconResult.address,
      ticketResult.address,
      PRIZE_DISTRIBUTION_FACTORY_MINIMUM_PICK_COST,
      END_TIMESTAMP_OFFSET,
    ],
    false
  );

  const prizeFlushResult: Contract = await deployAndVerify(
    "PrizeFlush",
    [deployer, prizeDistributorResult.address, reserveResult.address, stakePrizePoolResult.address],
    false
  );

  const beaconTimelockTriggerResult: Contract = await deployAndVerify(
    "BeaconTimelockTrigger",
    [deployer, prizeDistributionFactoryResult.address, drawCalculatorTimelockResult.address],
    false
  );

  // ===================================================
  // Configure Contracts
  // ===================================================

  await setTicket(ticketResult.address, stakePrizePoolResult.address);

  await setPrizeFlush(prizeFlushResult.address, stakePrizePoolResult.address);

  await setPrizeDistributor(prizeDistributorResult.address, drawBufferResult.address);

  await setDrawBeacon(drawBeaconResult.address, stakePrizePoolResult.address);

  await setManager("BeaconTimelockTrigger", beaconTimelockTriggerResult.address, null, defenderRelayer);
  await setManager("DrawBuffer", drawBufferResult.address, null, drawBeaconResult.address);
  await setManager("RNGServiceChainlinkV2", rngServiceChainlinkV2Result.address, null, prizeDistributorResult.address);
  await setManager("PrizeDistributor", prizeDistributorResult.address, null, defenderRelayer);
  await setManager("PrizeFlush", prizeFlushResult.address, null, defenderRelayer);
  await setManager("Reserve", reserveResult.address, null, prizeFlushResult.address);
  await setManager(
    "DrawCalculatorTimelock",
    drawCalculatorTimelockResult.address,
    null,
    beaconTimelockTriggerResult.address
  );
  await setManager(
    "PrizeDistributionFactory",
    prizeDistributionFactoryResult.address,
    null,
    beaconTimelockTriggerResult.address
  );
  await setManager(
    "PrizeDistributionBuffer",
    prizeDistributionBufferResult.address,
    null,
    prizeDistributionFactoryResult.address
  );
}
