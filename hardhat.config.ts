import { HardhatUserConfig } from "hardhat/config";

import "@nomicfoundation/hardhat-toolbox";

import "@openzeppelin/hardhat-upgrades";

import "@nomiclabs/hardhat-etherscan";

import "hardhat-dependency-compiler";

import "@nomiclabs/hardhat-ethers";

import * as dotenv from "dotenv";

import "hardhat-contract-sizer";

import "solidity-coverage";

import "hardhat-deploy";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
          evmVersion: "london",
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
          evmVersion: "istanbul",
        },
      },
      {
        version: "0.4.11",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
          evmVersion: "homestead",
        },
      },
      {
        version: "0.4.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 2000,
          },
          evmVersion: "homestead",
        },
      },
    ],
  },

  defaultNetwork: "hardhat",

  namedAccounts: {
    deployer: {
      default: 0,
    },
    defenderRelayer: {
      default: 0,
      goerli: "0x1169e2978d88549a796a10f2a13cb6826720f03a", // Ethereum (Mainnet) Defender Relayer
    },
  },

  networks: {
    mainnet: {
      url:
        String((process.env.ETHEREUM_MAINNET_RPC || "https://eth-mainnet.g.alchemy.com/v2/").trim()) +
        String(process.env.ALCHEMY_API_KEY?.trim()),
      chainId: 1,
      accounts: [(process.env.PRIVATE_KEY || "").trim()],
      timeout: 86400000,
      gasPrice: 60000000000, // 60 Gwei
    },
    sepolia: {
      url:
        String((process.env.ETHEREUM_SEPOLIA_RPC || "https://eth-sepolia.g.alchemy.com/v2/").trim()) +
        String(process.env.ALCHEMY_API_KEY?.trim()),
      chainId: 11155111,
      accounts: [(process.env.PRIVATE_KEY || "").trim()],
      timeout: 86400000,
      gasPrice: 30, // 30 Wei
    },
    goerli: {
      url:
        String((process.env.ETHEREUM_GOERLI_RPC || "https://eth-goerli.g.alchemy.com/v2/").trim()) +
        String(process.env.ALCHEMY_API_KEY?.trim()),
      chainId: 5,
      accounts: [(process.env.PRIVATE_KEY || "").trim()],
      timeout: 86400000,
      gasPrice: 250000000000, // 250 Gwei
    },
  },

  etherscan: {
    apiKey: {
      mainnet: (process.env.ETHERSCAN_API_KEY || "").trim(),
      sepolia: (process.env.ETHERSCAN_API_KEY || "").trim(),
      goerli: (process.env.ETHERSCAN_API_KEY || "").trim(),
    },
  },

  dependencyCompiler: {
    paths: [
      "@chainlink/contracts/src/v0.4/LinkToken.sol",
      "@chainlink/contracts/src/v0.6/tests/BlockhashStoreTestHelper.sol",
      "@chainlink/contracts/src/v0.8/VRFCoordinatorV2.sol",
      "@openzeppelin/contracts/governance/TimelockController.sol",
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
    ],
  },

  mocha: {
    timeout: 100_000_000,
  },
};

export default config;
