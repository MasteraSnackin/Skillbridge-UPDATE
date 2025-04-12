import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config"; // Import dotenv configuration

// Ensure environment variables are loaded. Use default values if not set for local testing.
const MUMBAI_RPC_URL = process.env.MUMBAI_RPC_URL || "https://rpc-mumbai.maticvigil.com/"; // Default public RPC
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "a".repeat(64); // Default placeholder private key - DO NOT USE FOR REAL DEPLOYMENTS

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20", // Match the version used in contracts
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Configuration for the local Hardhat Network
    },
    mumbai: {
      url: MUMBAI_RPC_URL,
      accounts: PRIVATE_KEY !== ("0x" + "a".repeat(64)) ? [PRIVATE_KEY] : [], // Only add accounts if PRIVATE_KEY is set
      chainId: 80001, // Polygon Mumbai chain ID
    },
    // Add other networks like mainnet here if needed
    // polygon: {
    //   url: process.env.POLYGON_RPC_URL || "",
    //   accounts: process.env.MAINNET_PRIVATE_KEY ? [process.env.MAINNET_PRIVATE_KEY] : [],
    //   chainId: 137,
    // }
  },
  etherscan: {
    // Add your Etherscan API key here for contract verification (optional)
    // apiKey: process.env.ETHERSCAN_API_KEY,
    // For Polygonscan:
     apiKey: {
       polygonMumbai: process.env.POLYGONSCAN_API_KEY || ""
       // polygon: process.env.POLYGONSCAN_API_KEY || ""
     }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000 // Increase timeout for tests that might take longer (like deployments)
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6', // Use ethers v6 types
  },
};

export default config;
