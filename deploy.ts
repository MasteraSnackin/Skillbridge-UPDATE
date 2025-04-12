import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance));

  // --- Deploy UserRegistry ---
  console.log("\nDeploying UserRegistry...");
  const userRegistryFactory = await ethers.getContractFactory("UserRegistry");
  const userRegistry = await userRegistryFactory.deploy();
  await userRegistry.waitForDeployment();
  const userRegistryAddress = await userRegistry.getAddress();
  console.log(`UserRegistry deployed to: ${userRegistryAddress}`);

  // --- Deploy JobPosting ---
  console.log("\nDeploying JobPosting...");
  const jobPostingFactory = await ethers.getContractFactory("JobPosting");
  // Pass the UserRegistry address to the JobPosting constructor
  const jobPosting = await jobPostingFactory.deploy(userRegistryAddress);
  await jobPosting.waitForDeployment();
  const jobPostingAddress = await jobPosting.getAddress();
  console.log(`JobPosting deployed to: ${jobPostingAddress}`);

  // --- Deploy Escrow ---
  console.log("\nDeploying Escrow...");
  const escrowFactory = await ethers.getContractFactory("Escrow");
  // Set initial fee percentage (e.g., 5%) and fee recipient (e.g., deployer address for now)
  const initialFeePercent = 5;
  const feeRecipientAddress = deployer.address; // Replace with actual platform fee address if needed
  console.log(`Escrow initial fee: ${initialFeePercent}%`);
  console.log(`Escrow fee recipient: ${feeRecipientAddress}`);
  // Pass UserRegistry and JobPosting addresses, fee, and recipient to Escrow constructor
  const escrow = await escrowFactory.deploy(
    userRegistryAddress,
    jobPostingAddress,
    initialFeePercent,
    feeRecipientAddress
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`Escrow deployed to: ${escrowAddress}`);

  console.log("\n--- Deployment Summary ---");
  console.log(`UserRegistry: ${userRegistryAddress}`);
  console.log(`JobPosting:   ${jobPostingAddress}`);
  console.log(`Escrow:       ${escrowAddress}`);
  console.log("--------------------------");

  // Optional: Verify contracts on Etherscan/Polygonscan if API key is set in hardhat.config.ts
  // Requires waiting a bit after deployment for propagation
  if (network.config.chainId !== 31337 && process.env.POLYGONSCAN_API_KEY) { // 31337 is hardhat network
      console.log("\nWaiting for block confirmations before verification...");
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds

      console.log("Verifying UserRegistry...");
      try {
          await ethers.run("verify:verify", {
              address: userRegistryAddress,
              constructorArguments: [],
          });
           console.log("UserRegistry verified successfully.");
      } catch (error) {
          console.error("UserRegistry verification failed:", error);
      }


      console.log("Verifying JobPosting...");
       try {
            await ethers.run("verify:verify", {
                address: jobPostingAddress,
                constructorArguments: [userRegistryAddress],
            });
            console.log("JobPosting verified successfully.");
       } catch (error) {
           console.error("JobPosting verification failed:", error);
       }


      console.log("Verifying Escrow...");
       try {
            await ethers.run("verify:verify", {
                address: escrowAddress,
                constructorArguments: [
                    userRegistryAddress,
                    jobPostingAddress,
                    initialFeePercent,
                    feeRecipientAddress,
                ],
            });
            console.log("Escrow verified successfully.");
       } catch (error) {
           console.error("Escrow verification failed:", error);
       }
  } else if (network.config.chainId !== 31337) {
       console.log("\nSkipping verification: POLYGONSCAN_API_KEY not found in .env or running on local network.");
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
