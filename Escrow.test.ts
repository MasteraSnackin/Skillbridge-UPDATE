import { ethers } from "hardhat";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { UserRegistry, JobPosting, Escrow, MockERC20 } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers"; // For timestamp checks if needed

describe("Escrow", function () {
    let userRegistry: UserRegistry;
    let jobPosting: JobPosting;
    let escrow: Escrow;
    let mockToken: MockERC20;
    let owner: HardhatEthersSigner;
    let client1: HardhatEthersSigner;
    let freelancer1: HardhatEthersSigner;
    let feeRecipient: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;

    const client1IpfsHash = "QmClientHash";
    const freelancer1IpfsHash = "QmFreelancerHash";
    const jobDetailsIpfsHash = "QmJobDetailsHash";
    const initialFeePercent = 5; // 5%
    const jobAmount = ethers.parseUnits("100", 18); // Assuming 18 decimals for mock token
    const zeroAddress = ethers.ZeroAddress;
    let jobId: bigint;
    let userRegistryAddress: string;
    let jobPostingAddress: string;
    let escrowAddress: string;
    let mockTokenAddress: string;


    beforeEach(async function () {
        [owner, client1, freelancer1, feeRecipient, otherUser] = await ethers.getSigners();

        // Deploy UserRegistry
        const UserRegistryFactory = await ethers.getContractFactory("UserRegistry");
        userRegistry = await UserRegistryFactory.deploy();
        await userRegistry.waitForDeployment();
        userRegistryAddress = await userRegistry.getAddress();

        // Deploy JobPosting
        const JobPostingFactory = await ethers.getContractFactory("JobPosting");
        jobPosting = await JobPostingFactory.deploy(userRegistryAddress);
        await jobPosting.waitForDeployment();
        jobPostingAddress = await jobPosting.getAddress();

        // Deploy MockERC20 Token
        const MockTokenFactory = await ethers.getContractFactory("MockERC20");
        mockToken = await MockTokenFactory.deploy("MockToken", "MTK");
        await mockToken.waitForDeployment();
        mockTokenAddress = await mockToken.getAddress();

        // Deploy Escrow
        const EscrowFactory = await ethers.getContractFactory("Escrow");
        escrow = await EscrowFactory.deploy(userRegistryAddress, jobPostingAddress, initialFeePercent, feeRecipient.address);
        await escrow.waitForDeployment();
        escrowAddress = await escrow.getAddress();

        // Setup: Register users, mint tokens, post/assign job
        await userRegistry.connect(client1).registerOrUpdateUser(client1IpfsHash);
        await userRegistry.connect(freelancer1).registerOrUpdateUser(freelancer1IpfsHash);
        await mockToken.connect(owner).mint(client1.address, ethers.parseUnits("1000", 18)); // Mint plenty for client

        // Post and assign a job to prepare for escrow
        const txPost = await jobPosting.connect(client1).postJob(jobDetailsIpfsHash, 0);
        const receiptPost = await txPost.wait();
        const eventPost = receiptPost?.logs?.find((e: any) => e.fragment?.name === 'JobPosted');
        jobId = eventPost?.args[0];
        await jobPosting.connect(client1).assignJob(jobId, freelancer1.address); // Assign the job
    });

    describe("Escrow Creation", function () {
        it("Should allow the client to create an escrow for an assigned job", async function () {
            await expect(escrow.connect(client1).createEscrow(jobId, mockTokenAddress, jobAmount))
                .to.emit(escrow, "EscrowCreated")
                .withArgs(jobId, client1.address, freelancer1.address, mockTokenAddress, jobAmount);

            const escrowDetails = await escrow.getEscrowDetails(jobId);
            expect(escrowDetails.jobId).to.equal(jobId);
            expect(escrowDetails.client).to.equal(client1.address);
            expect(escrowDetails.freelancer).to.equal(freelancer1.address);
            expect(escrowDetails.tokenAddress).to.equal(mockTokenAddress);
            expect(escrowDetails.amount).to.equal(jobAmount);
            expect(escrowDetails.status).to.equal(0); // EscrowStatus.Created
        });

        it("Should prevent creating escrow for a non-existent job ID", async function () {
            const nonExistentJobId = 999;
            await expect(escrow.connect(client1).createEscrow(nonExistentJobId, mockTokenAddress, jobAmount))
                .to.be.revertedWith("Escrow: Job ID not found in JobPosting contract");
        });

         it("Should prevent creating escrow if caller is not the client", async function () {
            await expect(escrow.connect(freelancer1).createEscrow(jobId, mockTokenAddress, jobAmount))
                .to.be.revertedWith("Escrow: Only the job client can create the escrow");
        });

        it("Should prevent creating escrow if job is not in 'Assigned' status", async function () {
            // Post a new job but don't assign it
            const txPost2 = await jobPosting.connect(client1).postJob("newJobHash", 0);
            const receiptPost2 = await txPost2.wait();
            const eventPost2 = receiptPost2?.logs?.find((e: any) => e.fragment?.name === 'JobPosted');
            const openJobId = eventPost2?.args[0];

            await expect(escrow.connect(client1).createEscrow(openJobId, mockTokenAddress, jobAmount))
                .to.be.revertedWith("Escrow: Job must be in Assigned status");
        });

        it("Should prevent creating escrow if freelancer is not registered/active", async function () {
             // Deactivate freelancer
             await userRegistry.connect(freelancer1).deactivateUser();
             await expect(escrow.connect(client1).createEscrow(jobId, mockTokenAddress, jobAmount))
                 .to.be.revertedWith("Escrow: Freelancer profile is not active");
        });

        it("Should prevent creating escrow with zero amount", async function () {
             await expect(escrow.connect(client1).createEscrow(jobId, mockTokenAddress, 0))
                 .to.be.revertedWith("Escrow: Amount must be greater than zero");
        });

         it("Should prevent creating escrow with zero token address", async function () {
             await expect(escrow.connect(client1).createEscrow(jobId, zeroAddress, jobAmount))
                 .to.be.revertedWith("Escrow: Invalid token address");
         });

        it("Should prevent creating escrow if one already exists for the job", async function () {
            await escrow.connect(client1).createEscrow(jobId, mockTokenAddress, jobAmount); // Create first
            await expect(escrow.connect(client1).createEscrow(jobId, mockTokenAddress, jobAmount)) // Try again
                .to.be.revertedWith("Escrow: Escrow already exists for this job");
        });
    });

    describe("Funding Escrow", function () {
        beforeEach(async function() {
            await escrow.connect(client1).createEscrow(jobId, mockTokenAddress, jobAmount);
            // Client approves Escrow contract to spend tokens
            await mockToken.connect(client1).approve(escrowAddress, jobAmount);
        });

        it("Should allow the client to deposit funds", async function () {
            const initialClientBalance = await mockToken.balanceOf(client1.address);
            const initialContractBalance = await mockToken.balanceOf(escrowAddress);

            await expect(escrow.connect(client1).depositFunds(jobId))
                .to.emit(escrow, "EscrowFunded")
                .withArgs(jobId, jobAmount, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            const escrowDetails = await escrow.getEscrowDetails(jobId);
            expect(escrowDetails.status).to.equal(1); // EscrowStatus.Funded

            // Check balances
            expect(await mockToken.balanceOf(client1.address)).to.equal(initialClientBalance - jobAmount);
            expect(await mockToken.balanceOf(escrowAddress)).to.equal(initialContractBalance + jobAmount);
        });

        it("Should prevent depositing funds if not the client", async function () {
            await mockToken.connect(client1).transfer(otherUser.address, jobAmount); // Give otherUser funds
            await mockToken.connect(otherUser).approve(escrowAddress, jobAmount); // otherUser approves
            await expect(escrow.connect(otherUser).depositFunds(jobId))
                .to.be.revertedWith("Escrow: Caller is not the client for this escrow");
        });

        it("Should prevent depositing funds if escrow status is not 'Created'", async function () {
            await escrow.connect(client1).depositFunds(jobId); // Fund it first
            await expect(escrow.connect(client1).depositFunds(jobId)) // Try funding again
                .to.be.revertedWith("Escrow: Escrow not in Created status");
        });

        it("Should prevent depositing funds if client has insufficient allowance", async function () {
            // Approve less than required
            await mockToken.connect(client1).approve(escrowAddress, jobAmount / BigInt(2));
            await expect(escrow.connect(client1).depositFunds(jobId))
                .to.be.reverted; // ERC20: transfer amount exceeds allowance (or similar SafeERC20 revert)
        });

        it("Should prevent depositing funds if client has insufficient balance", async function () {
            // Burn client's tokens (simulate insufficient balance)
            const clientBalance = await mockToken.balanceOf(client1.address);
            await mockToken.connect(client1).transfer(owner.address, clientBalance); // Transfer all away
             await mockToken.connect(client1).approve(escrowAddress, jobAmount); // Approve spending nothing essentially
            await expect(escrow.connect(client1).depositFunds(jobId))
                .to.be.reverted; // ERC20: transfer amount exceeds balance (or similar SafeERC20 revert)
        });
    });

    describe("Releasing Funds", function () {
         beforeEach(async function() {
            await escrow.connect(client1).createEscrow(jobId, mockTokenAddress, jobAmount);
            await mockToken.connect(client1).approve(escrowAddress, jobAmount);
            await escrow.connect(client1).depositFunds(jobId); // Fund the escrow
        });

        it("Should allow the client to release funds to the freelancer", async function () {
            const initialFreelancerBalance = await mockToken.balanceOf(freelancer1.address);
            const initialFeeRecipientBalance = await mockToken.balanceOf(feeRecipient.address);
            const initialContractBalance = await mockToken.balanceOf(escrowAddress);

            const expectedFee = (jobAmount * BigInt(initialFeePercent)) / BigInt(100);
            const expectedAmountToFreelancer = jobAmount - expectedFee;

            await expect(escrow.connect(client1).releaseFunds(jobId))
                .to.emit(escrow, "EscrowReleased")
                .withArgs(jobId, freelancer1.address, expectedAmountToFreelancer, expectedFee, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            const escrowDetails = await escrow.getEscrowDetails(jobId);
            expect(escrowDetails.status).to.equal(2); // EscrowStatus.Released

            // Check balances
            expect(await mockToken.balanceOf(freelancer1.address)).to.equal(initialFreelancerBalance + expectedAmountToFreelancer);
            expect(await mockToken.balanceOf(feeRecipient.address)).to.equal(initialFeeRecipientBalance + expectedFee);
            expect(await mockToken.balanceOf(escrowAddress)).to.equal(initialContractBalance - jobAmount); // Should be 0 if this was the only escrow
        });

         it("Should handle zero platform fee correctly", async function () {
            // Set fee to 0
            await escrow.connect(owner).setPlatformFee(0, feeRecipient.address);

            const initialFreelancerBalance = await mockToken.balanceOf(freelancer1.address);
            const initialFeeRecipientBalance = await mockToken.balanceOf(feeRecipient.address);
            const expectedFee = BigInt(0);
            const expectedAmountToFreelancer = jobAmount;

            await expect(escrow.connect(client1).releaseFunds(jobId))
                .to.emit(escrow, "EscrowReleased")
                .withArgs(jobId, freelancer1.address, expectedAmountToFreelancer, expectedFee, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            expect(await mockToken.balanceOf(freelancer1.address)).to.equal(initialFreelancerBalance + expectedAmountToFreelancer);
            expect(await mockToken.balanceOf(feeRecipient.address)).to.equal(initialFeeRecipientBalance); // No change
        });

        it("Should prevent releasing funds if not the client", async function () {
            await expect(escrow.connect(freelancer1).releaseFunds(jobId))
                .to.be.revertedWith("Escrow: Caller is not the client for this escrow");
        });

        it("Should prevent releasing funds if escrow status is not 'Funded'", async function () {
             // Create but don't fund
             const txPost2 = await jobPosting.connect(client1).postJob("job2", 0);
             const receiptPost2 = await txPost2.wait();
             const eventPost2 = receiptPost2?.logs?.find((e: any) => e.fragment?.name === 'JobPosted');
             const jobId2 = eventPost2?.args[0];
             await jobPosting.connect(client1).assignJob(jobId2, freelancer1.address);
             await escrow.connect(client1).createEscrow(jobId2, mockTokenAddress, jobAmount);

             await expect(escrow.connect(client1).releaseFunds(jobId2))
                 .to.be.revertedWith("Escrow: Escrow not funded");
        });
    });

     describe("Cancelling Escrow", function () {
         beforeEach(async function() {
            await escrow.connect(client1).createEscrow(jobId, mockTokenAddress, jobAmount);
            await mockToken.connect(client1).approve(escrowAddress, jobAmount);
            await escrow.connect(client1).depositFunds(jobId); // Fund the escrow
        });

        it("Should allow the client to cancel a funded escrow", async function () {
            const initialClientBalance = await mockToken.balanceOf(client1.address);
            const initialContractBalance = await mockToken.balanceOf(escrowAddress);

            await expect(escrow.connect(client1).cancelEscrow(jobId))
                .to.emit(escrow, "EscrowCancelled")
                .withArgs(jobId, client1.address, jobAmount, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            const escrowDetails = await escrow.getEscrowDetails(jobId);
            expect(escrowDetails.status).to.equal(3); // EscrowStatus.Cancelled

            // Check balances
            expect(await mockToken.balanceOf(client1.address)).to.equal(initialClientBalance + jobAmount);
            expect(await mockToken.balanceOf(escrowAddress)).to.equal(initialContractBalance - jobAmount);
        });

        it("Should prevent cancelling if not the client", async function () {
            await expect(escrow.connect(freelancer1).cancelEscrow(jobId))
                .to.be.revertedWith("Escrow: Caller is not the client for this escrow");
        });

        it("Should prevent cancelling if escrow status is not 'Funded'", async function () {
            // Release funds first
            await escrow.connect(client1).releaseFunds(jobId);
            await expect(escrow.connect(client1).cancelEscrow(jobId))
                .to.be.revertedWith("Escrow: Escrow not in cancellable state (must be Funded)");
        });

         it("Should prevent cancelling if escrow is only 'Created'", async function () {
             // Create but don't fund
             const txPost2 = await jobPosting.connect(client1).postJob("job2", 0);
             const receiptPost2 = await txPost2.wait();
             const eventPost2 = receiptPost2?.logs?.find((e: any) => e.fragment?.name === 'JobPosted');
             const jobId2 = eventPost2?.args[0];
             await jobPosting.connect(client1).assignJob(jobId2, freelancer1.address);
             await escrow.connect(client1).createEscrow(jobId2, mockTokenAddress, jobAmount);

             await expect(escrow.connect(client1).cancelEscrow(jobId2))
                 .to.be.revertedWith("Escrow: Escrow not in cancellable state (must be Funded)");
         });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to set platform fee", async function () {
            const newFee = 10;
            const newRecipient = otherUser.address;
            await expect(escrow.connect(owner).setPlatformFee(newFee, newRecipient))
                .to.emit(escrow, "PlatformFeeUpdated")
                .withArgs(newFee, newRecipient);
            expect(await escrow.platformFeePercent()).to.equal(newFee);
            expect(await escrow.feeRecipient()).to.equal(newRecipient);
        });

        it("Should prevent non-owner from setting platform fee", async function () {
            await expect(escrow.connect(client1).setPlatformFee(10, otherUser.address))
                .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount")
                .withArgs(client1.address);
        });

         it("Should prevent setting fee > 100", async function () {
            await expect(escrow.connect(owner).setPlatformFee(101, otherUser.address))
                .to.be.revertedWith("Escrow: Fee percent cannot exceed 100");
        });

         it("Should prevent setting fee recipient to zero address", async function () {
            await expect(escrow.connect(owner).setPlatformFee(10, zeroAddress))
                .to.be.revertedWith("Escrow: Invalid fee recipient address");
        });

        // Tests for setUserRegistryAddress and setJobPostingAddress (similar structure to JobPosting tests)
         it("Should allow owner to set UserRegistry address", async function () {
            const NewUserRegistryFactory = await ethers.getContractFactory("UserRegistry");
            const newUserRegistry = await NewUserRegistryFactory.deploy();
            await newUserRegistry.waitForDeployment();
            const addr = await newUserRegistry.getAddress();
            await escrow.connect(owner).setUserRegistryAddress(addr);
            expect(await escrow.userRegistry()).to.equal(addr);
         });

          it("Should allow owner to set JobPosting address", async function () {
            const NewJobPostingFactory = await ethers.getContractFactory("JobPosting");
            const newJobPosting = await NewJobPostingFactory.deploy(userRegistryAddress); // Needs registry addr
            await newJobPosting.waitForDeployment();
            const addr = await newJobPosting.getAddress();
            await escrow.connect(owner).setJobPostingAddress(addr);
            expect(await escrow.jobPosting()).to.equal(addr);
         });
    });
});
