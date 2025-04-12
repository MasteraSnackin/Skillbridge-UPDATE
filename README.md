# Polygon SkillBridge

Polygon SkillBridge is a decentralized freelance marketplace platform built on the Polygon blockchain. It connects clients looking for skilled professionals with freelancers seeking work opportunities, leveraging smart contracts for secure user management, job posting, and escrow payments using ERC20 tokens.

## Features

**Smart Contracts (Solidity):**

*   **User Registry (`UserRegistry.sol`):**
    *   Manages user registration and profiles.
    *   Users identified by wallet address.
    *   Stores profile details off-chain (e.g., IPFS) referenced by a hash.
    *   Supports user activation/deactivation (by user and admin).
*   **Job Posting (`JobPosting.sol`):**
    *   Allows registered clients to post jobs with details (stored off-chain via IPFS hash) and optional deadlines.
    *   Manages job lifecycle statuses (Open, Assigned, InProgress, Completed, Cancelled, Disputed).
    *   Assigns freelancers to jobs.
    *   Requires `UserRegistry` for user verification.
*   **Escrow (`Escrow.sol`):**
    *   Handles escrow payments for jobs using specified ERC20 tokens.
    *   Clients deposit funds after a job is assigned.
    *   Funds are released to the freelancer upon client approval.
    *   Supports cancellation and fund return before work completion (in the current basic version).
    *   Includes an optional platform fee mechanism.
    *   Requires `UserRegistry` and `JobPosting` for context and verification.

**Frontend (Next.js):**

*   (Basic structure in place - features to be built out)
*   Connect Wallet functionality using Wagmi.
*   Placeholder UI for finding talent/work.
*   Built with Next.js App Router.
*   Styled with Tailwind CSS.
*   Uses TypeScript for type safety.

## Tech Stack

**Contracts:**

*   **Solidity:** ^0.8.20
*   **Hardhat:** Development environment, testing, deployment scripting.
*   **OpenZeppelin Contracts:** For standard implementations like Ownable, ERC20 interfaces.
*   **TypeChain:** For generating TypeScript types from contracts.
*   **Ethers.js:** (via Hardhat) For interacting with contracts.
*   **dotenv:** For managing environment variables (API keys, private keys).

**Frontend:**

*   **Next.js:** ^15 (React framework with App Router)
*   **React:** ^19
*   **TypeScript:** ^5.8
*   **Wagmi:** React Hooks for Ethereum interaction.
*   **Viem:** Low-level Ethereum interface library.
*   **TanStack Query:** Data fetching and state management.
*   **Tailwind CSS:** Utility-first CSS framework.
*   **PostCSS & Autoprefixer:** CSS processing.

## Project Structure

```
Polygon SkillBridge/
├── contracts/
│   ├── contracts/          # Solidity smart contracts
│   │   ├── UserRegistry.sol
│   │   ├── JobPosting.sol
│   │   └── Escrow.sol
│   ├── scripts/            # Deployment scripts (e.g., deploy.ts)
│   ├── test/               # Hardhat tests (e.g., *.test.ts)
│   ├── hardhat.config.ts   # Hardhat configuration
│   ├── package.json
│   ├── tsconfig.json
│   └── ...                 # Other Hardhat files (cache, artifacts, typechain-types)
│
├── frontend/
│   ├── app/                # Next.js App Router pages and layouts
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/         # React components (e.g., ConnectWalletButton.tsx)
│   ├── src/lib/            # Utility functions, configurations (e.g., wagmi.ts)
│   ├── public/             # Static assets
│   ├── next.config.mjs     # Next.js configuration
│   ├── tailwind.config.ts  # Tailwind CSS configuration
│   ├── postcss.config.js
│   ├── package.json
│   ├── tsconfig.json
│   └── ...
│
└── README.md               # This file
```

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm or yarn
*   Git

### Setup - Contracts

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd Polygon-SkillBridge/contracts
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Create Environment File:**
    *   Copy `.env.example` (if provided) to `.env`.
    *   Fill in the required environment variables:
        *   `MUMBAI_RPC_URL`: RPC endpoint URL for Polygon Mumbai testnet.
        *   `PRIVATE_KEY`: Private key of the account you want to use for deployment (DO NOT commit this file).
        *   `POLYGONSCAN_API_KEY`: (Optional) Your Polygonscan API key for contract verification.
    ```env
    MUMBAI_RPC_URL="https://your_mumbai_rpc_url"
    PRIVATE_KEY="0xyour_private_key"
    POLYGONSCAN_API_KEY="your_polygonscan_api_key"
    ```

### Setup - Frontend

1.  **Navigate to the frontend directory:**
    ```bash
    cd ../frontend
    # (Assuming you are in the contracts directory)
    # Or from the root: cd Polygon-SkillBridge/frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Create Environment File:**
    *   The frontend might require environment variables, especially for WalletConnect. Create a `.env.local` file in the `frontend` directory.
    *   Add necessary variables like `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`. Get a Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/).
    ```env
    # frontend/.env.local
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID="your_walletconnect_project_id"
    ```

## Usage

### Running the Frontend Development Server

1.  Navigate to the `frontend` directory:
    ```bash
    cd Polygon-SkillBridge/frontend
    ```
2.  Start the development server:
    ```bash
    npm run dev
    # or
    yarn dev
    ```
3.  Open your browser and go to `http://localhost:3000`.

### Compiling Contracts

1.  Navigate to the `contracts` directory:
    ```bash
    cd Polygon-SkillBridge/contracts
    ```
2.  Compile the smart contracts:
    ```bash
    npx hardhat compile
    ```
    This will generate artifacts and TypeChain typings.

## Testing

1.  Navigate to the `contracts` directory:
    ```bash
    cd Polygon-SkillBridge/contracts
    ```
2.  Run the Hardhat tests:
    ```bash
    npx hardhat test
    ```
    (Ensure test files exist in the `test/` directory).

## Deployment

1.  Navigate to the `contracts` directory:
    ```bash
    cd Polygon-SkillBridge/contracts
    ```
2.  Ensure your `.env` file is configured correctly with `MUMBAI_RPC_URL` and `PRIVATE_KEY`.
3.  Run the deployment script (assuming a script like `scripts/deploy.ts` exists and is configured):
    ```bash
    npx hardhat run scripts/deploy.ts --network mumbai
    ```
4.  (Optional) Verify the contracts on Polygonscan if `POLYGONSCAN_API_KEY` is set in `.env` and the verification logic is added to the deployment script or run separately using `hardhat-etherscan`.

**Note:** The deployment script (`deploy.ts`) needs to handle the deployment order and linking of contracts (e.g., passing the `UserRegistry` address to `JobPosting` and `Escrow` constructors).

## Environment Variables

*   **Contracts (`contracts/.env`):**
    *   `MUMBAI_RPC_URL`: JSON-RPC endpoint for the target network.
    *   `PRIVATE_KEY`: Deployer wallet private key.
    *   `POLYGONSCAN_API_KEY`: (Optional) For contract verification.
*   **Frontend (`frontend/.env.local`):**
    *   `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: Required for WalletConnect v2 integration.

**Security:** Never commit files containing private keys or sensitive API keys (`.env`, `.env.local`) to your Git repository. Use a `.gitignore` file to exclude them.


**Starlight:  dApp Discovery tool**

- https://stellarlight.xyz/ecosystem
- Allows you to search and filter dApps by category such as "Lending & Borrowing"


