import { ethers } from "hardhat";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { UserRegistry } from "../typechain-types"; // Adjust if typechain output path differs

describe("UserRegistry", function () {
    let userRegistry: UserRegistry;
    let owner: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    const initialIpfsHash = "QmInitialHash";
    const updatedIpfsHash = "QmUpdatedHash";

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        const UserRegistryFactory = await ethers.getContractFactory("UserRegistry");
        userRegistry = await UserRegistryFactory.deploy();
        // await userRegistry.deployed(); // .deployed() is deprecated
        await userRegistry.waitForDeployment(); // Use waitForDeployment() instead
    });

    it("Should set the deployer as the owner", async function () {
        expect(await userRegistry.owner()).to.equal(owner.address);
    });

    describe("User Registration and Updates", function () {
        it("Should allow a new user to register", async function () {
            await expect(userRegistry.connect(user1).registerOrUpdateUser(initialIpfsHash))
                .to.emit(userRegistry, "UserRegistered")
                .withArgs(user1.address, initialIpfsHash, (await ethers.provider.getBlock("latest"))!.timestamp + 1); // Timestamp might be off by 1 block

            const profile = await userRegistry.getUserProfile(user1.address);
            expect(profile.ipfsHash).to.equal(initialIpfsHash);
            expect(profile.isActive).to.be.true;
            expect(await userRegistry.isUserRegistered(user1.address)).to.be.true;
        });

        it("Should allow a registered user to update their profile", async function () {
            await userRegistry.connect(user1).registerOrUpdateUser(initialIpfsHash); // Register first
            await expect(userRegistry.connect(user1).registerOrUpdateUser(updatedIpfsHash))
                .to.emit(userRegistry, "UserProfileUpdated")
                .withArgs(user1.address, updatedIpfsHash, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            const profile = await userRegistry.getUserProfile(user1.address);
            expect(profile.ipfsHash).to.equal(updatedIpfsHash);
        });

        it("Should prevent registration/update with an empty IPFS hash", async function () {
            await expect(userRegistry.connect(user1).registerOrUpdateUser(""))
                .to.be.revertedWith("UserRegistry: IPFS hash cannot be empty");
        });
    });

    describe("User Activation Status", function () {
        beforeEach(async function () {
            await userRegistry.connect(user1).registerOrUpdateUser(initialIpfsHash);
        });

        it("Should allow a user to deactivate their profile", async function () {
            await expect(userRegistry.connect(user1).deactivateUser())
                .to.emit(userRegistry, "UserDeactivated")
                .withArgs(user1.address, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            const profile = await userRegistry.getUserProfile(user1.address);
            expect(profile.isActive).to.be.false;
        });

        it("Should prevent deactivating an already deactivated profile", async function () {
            await userRegistry.connect(user1).deactivateUser();
            await expect(userRegistry.connect(user1).deactivateUser())
                .to.be.revertedWith("UserRegistry: Profile already deactivated");
        });

         it("Should allow a deactivated user to reactivate their profile", async function () {
            await userRegistry.connect(user1).deactivateUser();
            await expect(userRegistry.connect(user1).reactivateUser())
                .to.emit(userRegistry, "UserReactivated")
                .withArgs(user1.address, (await ethers.provider.getBlock("latest"))!.timestamp + 1);

            const profile = await userRegistry.getUserProfile(user1.address);
            expect(profile.isActive).to.be.true;
        });

        it("Should prevent reactivating an already active profile", async function () {
            await expect(userRegistry.connect(user1).reactivateUser())
                .to.be.revertedWith("UserRegistry: Profile already active");
        });

        it("Should prevent updating a deactivated profile", async function () {
            await userRegistry.connect(user1).deactivateUser();
            await expect(userRegistry.connect(user1).registerOrUpdateUser(updatedIpfsHash))
                .to.be.revertedWith("UserRegistry: Cannot update deactivated profile");
        });
    });

    describe("Access Control", function () {
         beforeEach(async function () {
            await userRegistry.connect(user1).registerOrUpdateUser(initialIpfsHash);
        });

        it("Should prevent non-registered user from deactivating", async function () {
             await expect(userRegistry.connect(user2).deactivateUser())
                .to.be.revertedWith("UserRegistry: Caller is not registered");
        });

         it("Should prevent non-registered user from reactivating", async function () {
             // Need to register and deactivate first to test reactivation failure
             await userRegistry.connect(user1).deactivateUser();
             await expect(userRegistry.connect(user2).reactivateUser()) // user2 tries to reactivate user1 (or themselves)
                .to.be.revertedWith("UserRegistry: Caller is not registered");
        });

        it("Should prevent getting profile of non-existent user", async function () {
            await expect(userRegistry.getUserProfile(user2.address))
                .to.be.revertedWith("UserRegistry: User does not exist");
        });
    });

    describe("Admin Functions", function () {
        beforeEach(async function () {
            await userRegistry.connect(user1).registerOrUpdateUser(initialIpfsHash);
        });

        it("Should allow owner to deactivate a user", async function () {
            await expect(userRegistry.connect(owner).adminDeactivateUser(user1.address))
                .to.emit(userRegistry, "UserDeactivated")
                .withArgs(user1.address, (await ethers.provider.getBlock("latest"))!.timestamp + 1);
            const profile = await userRegistry.getUserProfile(user1.address);
            expect(profile.isActive).to.be.false;
        });

        it("Should prevent non-owner from deactivating a user", async function () {
            await expect(userRegistry.connect(user2).adminDeactivateUser(user1.address))
                .to.be.revertedWithCustomError(userRegistry, "OwnableUnauthorizedAccount")
                .withArgs(user2.address);
        });

        it("Should allow owner to reactivate a user", async function () {
            await userRegistry.connect(owner).adminDeactivateUser(user1.address); // Deactivate first
            await expect(userRegistry.connect(owner).adminReactivateUser(user1.address))
                .to.emit(userRegistry, "UserReactivated")
                .withArgs(user1.address, (await ethers.provider.getBlock("latest"))!.timestamp + 1);
            const profile = await userRegistry.getUserProfile(user1.address);
            expect(profile.isActive).to.be.true;
        });

         it("Should prevent non-owner from reactivating a user", async function () {
            await userRegistry.connect(owner).adminDeactivateUser(user1.address); // Deactivate first
            await expect(userRegistry.connect(user2).adminReactivateUser(user1.address))
                .to.be.revertedWithCustomError(userRegistry, "OwnableUnauthorizedAccount")
                .withArgs(user2.address);
        });

        it("Should prevent admin deactivating non-existent user", async function () {
             await expect(userRegistry.connect(owner).adminDeactivateUser(user2.address))
                .to.be.revertedWith("UserRegistry: User does not exist");
        });

         it("Should prevent admin reactivating non-existent user", async function () {
             await expect(userRegistry.connect(owner).adminReactivateUser(user2.address))
                .to.be.revertedWith("UserRegistry: User does not exist");
        });
    });
});
