const { getFirstLidoRebaseTimestamp } = require("../scripts/helpers/getFirstLidoRebaseTimestamp");

const { PRIZE_DISTRIBUTION_BUFFER_CARDINALITY } = require("../src/constants");

const { deploy1820 } = require("deploy-eip-1820");

const { BigNumber } = require("ethers");

const chalk = require("chalk");

function dim() {
  if (!process.env.HIDE_DEPLOY_LOG) {
    console.log(chalk.dim.call(chalk, ...arguments));
  }
}

function cyan() {
  if (!process.env.HIDE_DEPLOY_LOG) {
    console.log(chalk.cyan.call(chalk, ...arguments));
  }
}

function yellow() {
  if (!process.env.HIDE_DEPLOY_LOG) {
    console.log(chalk.yellow.call(chalk, ...arguments));
  }
}

function green() {
  if (!process.env.HIDE_DEPLOY_LOG) {
    console.log(chalk.green.call(chalk, ...arguments));
  }
}

function displayResult(name, result) {
  if (!result.newlyDeployed) {
    yellow(`Re-used existing ${name} at ${result.address}`);
  } else {
    green(`${name} deployed at ${result.address}`);
  }
}

const chainName = (chainId) => {
  switch (chainId) {
    case 1:
      return "Mainnet";
    case 5:
      return "Goerli";
    default:
      return "Unknown";
  }
};

module.exports = async (hardhat) => {
  // Added to ignore this file when running deployment script on goerli and mainnet
  if (process.env.DEPLOY !== undefined) {
    return;
  }

  const { getNamedAccounts, getChainId, ethers, deployments } = hardhat;
  const { deployAndLog } = require("../src/deployAndLog");

  let { deployer } = await getNamedAccounts();

  const chainId = parseInt(await getChainId(), 10);

  // 31337 is unit testing, 1337 is for coverage
  const isTestEnvironment = chainId === 31337 || chainId === 1337;

  const signer = await ethers.provider.getSigner(deployer);

  dim("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  dim("Asymetrix Protocol Pool Contracts - Deploy Script");
  dim("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");

  dim(`Network: ${chainName(chainId)} (${isTestEnvironment ? "local" : "remote"})`);
  dim(`Deployer: ${deployer}`);

  await deploy1820(signer);
  const asxTokenDeploy = await deployAndLog("ASX", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [
            process.env.ASX_NAME?.trim() || "Asymetrix Governance Token",
            process.env.ASX_SYMBOL?.trim() || "ASX",
            BigNumber.from(process.env.ASX_CAP?.trim() || ethers.utils.parseEther("100000000")),
            process.env.ASX_INITIAL_SUPPLY_RECEIVER?.trim() || deployer,
          ],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });
  const stakeToken = await deployAndLog("StakeToken", {
    from: deployer,
    contract: "ERC20Mintable",
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: ["Token", "TOK"],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  await deployAndLog("StakePrizePool", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [
            deployer,
            stakeToken.address,
            asxTokenDeploy.address,
            BigNumber.from(process.env.REWARD_PER_SECOND?.trim() || ethers.utils.parseEther("10000000")),
            BigNumber.from(process.env.MAX_CLAIM_INTERVAL?.trim() || "604800"),
            BigNumber.from(process.env.CLAIM_INTERVAL?.trim() || "86400"),
            BigNumber.from(process.env.FREE_EXIT_DURATION?.trim() || "14400"),
            getFirstLidoRebaseTimestamp(),
            BigNumber.from(process.env.LIDO_APR?.trim() || "500"),
          ],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });
  const stakePrizePool = await ethers.getContract("StakePrizePool", deployer);

  const ticketDeploy = await deployAndLog("Ticket", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: ["Ticket", "TICK", 18, stakePrizePool.address],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  cyan("\nsetTicket for StakePrizePool...");
  const setTicketResult = await stakePrizePool.setTicket(ticketDeploy.address);
  displayResult("setTicket", setTicketResult);

  yellow("\nPrize Pool Setup Complete");
  yellow("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");

  const cardinality = 8;

  await deployAndLog("DrawBuffer", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [deployer, cardinality],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });
  const drawBuffer = await ethers.getContract("DrawBuffer", deployer);

  const tsunamiDrawSettingsHistory = await deployAndLog("TsunamiDrawSettingsHistory", {
    from: deployer,
    contract: "PrizeDistributionBuffer",
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [deployer, cardinality],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  const drawBeacon = await deployAndLog("DrawBeacon", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [
            deployer,
            drawBuffer.address,
            1,
            parseInt("" + new Date().getTime() / 1000),
            120, // 2 minute intervals
          ],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  cyan("\nSet DrawBeacon as manager for DrawBuffer...");

  await drawBuffer.setManager(drawBeacon.address);

  green("DrawBeacon manager set!");

  await deployAndLog("DrawCalculator", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [ticketDeploy.address, drawBuffer.address, tsunamiDrawSettingsHistory.address],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  const prizeDistributionBuffer = await deployAndLog("PrizeDistributionBuffer", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [deployer, PRIZE_DISTRIBUTION_BUFFER_CARDINALITY],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  const rngServiceChainlinkV2 = await deployAndLog("RNGServiceChainlinkV2", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [
            deployer,
            process.env.VRF_COORDINATOR?.trim() || "0x2ca8e0c643bde4c2e08ab1fa0da3401adad7734d",
            BigNumber.from(process.env.SUBSCRIPTION_ID?.trim() || "0"),
            process.env.KEY_HASH?.trim() || "0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15",
          ],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  const prizeDistributor = await deployAndLog("PrizeDistributor", {
    from: deployer,
    proxy: {
      owner: deployer,
      proxyContract: "OpenZeppelinTransparentProxy",
      execute: {
        init: {
          methodName: "initialize", // method to be executed when the proxy is deployed
          args: [
            deployer,
            ticketDeploy.address,
            drawBuffer.address,
            prizeDistributionBuffer.address,
            rngServiceChainlinkV2.address,
            process.env.DISTRIBUTION ? process.env.DISTRIBUTION.trim().split(",") : ["10000"],
            BigNumber.from(process.env.RNG_TIMEOUT?.trim() || "7200"),
          ],
        },
      },
    },
    args: [],
    skipIfAlreadyDeployed: false,
  });

  await drawBuffer.setPrizeDistributor(prizeDistributor.address);

  dim("\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  green("Contract Deployments Complete!");
  dim("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n");
};
