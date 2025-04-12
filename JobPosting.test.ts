import { ethers } from "hardhat";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { UserRegistry, JobPosting } from "../typechain-types";

describe("JobPosting", function () {
    let userRegistry: UserRegistry;
    let jobPosting: JobPosting;
    let owner: HardhatEthersSigner;
    let client1: HardhatEthersSigner;
    let freelancer1: HardhatEthersSigner;
    let userWithoutProfile: HardhatEthersSigner;

    const client1IpfsHash = "QmClientHash";
    const freelancer1IpfsHash = "QmFreelancerHash";
    const jobDetailsIpfsHash = "QmJobDetailsHash";
    const updatedJobDetailsIpfsHash = "QmUpdatedJobDetailsHash";
    const zeroAddress = ethers.ZeroAddress;

    beforeEach(async function () {
        [owner, client1, freelancer1, userWithoutProfile] = await ethers.getSigners();

        // Deploy UserRegistry
        const UserRegistryFactory = await ethers.getContractFactory("UserRegistry");
        userRegistry = await UserRegistryFactory.deploy();
        await userRegistry.waitForDeployment();
        const userRegistryAddress = await userRegistry.getAddress();

        // Deploy JobPosting, linking UserRegistry
        const JobPostingFactory = await ethers.getContractFactory("JobPosting");
        jobPosting = await JobPostingFactory.deploy(userRegistryAddress);
        await jobPosting.waitForDeployment();

        // Register client1 and freelancer1
        await userRegistry.connect(client1).registerOrUpdateUser(client1IpfsHash);
        await userRegistry.connect(freelancer1).registerOrUpdateUser(freelancer1IpfsHash);
    });

    describe("Job Creation", function () {
        it("Should allow a registered, active client to post a job", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 86400; // 1 day from now
            await expect(jobPosting.connect(client1).postJob(jobDetailsIpfsHash, deadline))
                .to.emit(jobPosting, "JobPosted")
                .withArgs(1, client1.address, jobDetailsIpfsHash, deadline, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            const job = await jobPosting.getJobDetails(1);
            expect(job.id).to.equal(1);
            expect(job.client).to.equal(client1.address);
            expect(job.detailsIpfsHash).to.equal(jobDetailsIpfsHash);
            expect(job.completionDeadline).to.equal(deadline);
            expect(job.status).to.equal(0); // JobStatus.Open
            expect(job.assignedFreelancer).to.equal(zeroAddress);

            const clientJobs = await jobPosting.getJobsByClient(client1.address);
            expect(clientJobs).to.deep.equal([ethers.toBigInt(1)]); // Use ethers.toBigInt for comparison
            expect(await jobPosting.getTotalJobs()).to.equal(1);
        });

        it("Should prevent unregistered users from posting jobs", async function () {
            await expect(jobPosting.connect(userWithoutProfile).postJob(jobDetailsIpfsHash, 0))
                .to.be.revertedWith("JobPosting: User not registered");
        });

        it("Should prevent users with deactivated profiles from posting jobs", async function () {
            await userRegistry.connect(client1).deactivateUser(); // Deactivate client1
            await expect(jobPosting.connect(client1).postJob(jobDetailsIpfsHash, 0))
                .to.be.revertedWith("JobPosting: User profile is not active");
        });

        it("Should prevent posting a job with an empty details hash", async function () {
            await expect(jobPosting.connect(client1).postJob("", 0))
                .to.be.revertedWith("JobPosting: Details IPFS hash cannot be empty");
        });
    });

    describe("Job Updates", function () {
        let jobId: bigint;
        beforeEach(async function() {
            const tx = await jobPosting.connect(client1).postJob(jobDetailsIpfsHash, 0);
            const receipt = await tx.wait();
            // Find the JobPosted event in the transaction receipt logs
            const event = receipt?.logs?.find((e: any) => e.fragment?.name === 'JobPosted');
            jobId = event?.args[0]; // Extract jobId from event args
            expect(jobId).to.not.be.undefined;
        });

        it("Should allow the client to update details of an Open job", async function () {
             const newDeadline = Math.floor(Date.now() / 1000) + 172800; // 2 days
             await expect(jobPosting.connect(client1).updateJobDetails(jobId, updatedJobDetailsIpfsHash, newDeadline))
                .to.emit(jobPosting, "JobDetailsUpdated")
                .withArgs(jobId, updatedJobDetailsIpfsHash, newDeadline, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

             const job = await jobPosting.getJobDetails(jobId);
             expect(job.detailsIpfsHash).to.equal(updatedJobDetailsIpfsHash);
             expect(job.completionDeadline).to.equal(newDeadline);
        });

        it("Should prevent non-client from updating job details", async function () {
             await expect(jobPosting.connect(freelancer1).updateJobDetails(jobId, updatedJobDetailsIpfsHash, 0))
                .to.be.revertedWith("JobPosting: Caller is not the client of this job");
        });

        it("Should prevent updating details of a non-existent job", async function () {
             const nonExistentJobId = 999;
             await expect(jobPosting.connect(client1).updateJobDetails(nonExistentJobId, updatedJobDetailsIpfsHash, 0))
                 .to.be.revertedWith("JobPosting: Job does not exist");
        });

         it("Should prevent updating details with an empty IPFS hash", async function () {
             await expect(jobPosting.connect(client1).updateJobDetails(jobId, "", 0))
                 .to.be.revertedWith("JobPosting: Details IPFS hash cannot be empty");
         });

        // Add test for preventing update if job status is not Open after assignment is implemented
    });


    describe("Job Assignment", function () {
        let jobId: bigint;
        beforeEach(async function() {
            const tx = await jobPosting.connect(client1).postJob(jobDetailsIpfsHash, 0);
            const receipt = await tx.wait();
            const event = receipt?.logs?.find((e: any) => e.fragment?.name === 'JobPosted');
            jobId = event?.args[0];
            expect(jobId).to.not.be.undefined;
        });

        it("Should allow the client to assign an Open job to a registered, active freelancer", async function () {
            await expect(jobPosting.connect(client1).assignJob(jobId, freelancer1.address))
                .to.emit(jobPosting, "JobAssigned").withArgs(jobId, freelancer1.address, (await ethers.provider.getBlock("latest"))!.timestamp + 1)
                .and.to.emit(jobPosting, "JobStatusUpdated").withArgs(jobId, 1, (await ethers.provider.getBlock("latest"))!.timestamp + 1); // Status Assigned = 1

            const job = await jobPosting.getJobDetails(jobId);
            expect(job.assignedFreelancer).to.equal(freelancer1.address);
            expect(job.status).to.equal(1); // JobStatus.Assigned
        });

        it("Should prevent non-client from assigning the job", async function () {
            await expect(jobPosting.connect(freelancer1).assignJob(jobId, freelancer1.address))
                .to.be.revertedWith("JobPosting: Caller is not the client of this job");
        });

        it("Should prevent assigning a non-existent job", async function () {
            const nonExistentJobId = 999;
            await expect(jobPosting.connect(client1).assignJob(nonExistentJobId, freelancer1.address))
                .to.be.revertedWith("JobPosting: Job does not exist");
        });

        it("Should prevent assigning the job to an unregistered user", async function () {
            await expect(jobPosting.connect(client1).assignJob(jobId, userWithoutProfile.address))
                .to.be.revertedWith("JobPosting: User not registered"); // Check comes from onlyRegisteredActiveUser modifier
        });

         it("Should prevent assigning the job to a user with a deactivated profile", async function () {
            await userRegistry.connect(freelancer1).deactivateUser();
            await expect(jobPosting.connect(client1).assignJob(jobId, freelancer1.address))
                .to.be.revertedWith("JobPosting: User profile is not active"); // Check comes from onlyRegisteredActiveUser modifier
        });

        it("Should prevent assigning the job to the zero address", async function () {
             await expect(jobPosting.connect(client1).assignJob(jobId, zeroAddress))
                .to.be.revertedWith("JobPosting: Invalid freelancer address");
        });

        it("Should prevent assigning a job that is not Open", async function () {
            await jobPosting.connect(client1).assignJob(jobId, freelancer1.address); // Assign first
            await expect(jobPosting.connect(client1).assignJob(jobId, freelancer1.address)) // Try assigning again
                .to.be.revertedWith("JobPosting: Job is not Open");
        });

         it("Should prevent updating details of an Assigned job", async function () {
             await jobPosting.connect(client1).assignJob(jobId, freelancer1.address); // Assign first
             await expect(jobPosting.connect(client1).updateJobDetails(jobId, updatedJobDetailsIpfsHash, 0))
                 .to.be.revertedWith("JobPosting: Can only update Open jobs");
         });
    });

     describe("Admin Functions", function () {
        it("Should allow owner to set a new UserRegistry address", async function () {
            const NewUserRegistryFactory = await ethers.getContractFactory("UserRegistry");
            const newUserRegistry = await NewUserRegistryFactory.deploy();
            await newUserRegistry.waitForDeployment();
            const newUserRegistryAddress = await newUserRegistry.getAddress();
