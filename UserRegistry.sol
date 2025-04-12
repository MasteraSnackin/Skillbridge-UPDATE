// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title UserRegistry
 * @dev Manages user registration and profile data on SkillBridge.
 * Users are identified by their wallet address.
 * Profile details are stored off-chain (e.g., on IPFS) and referenced here by a hash.
 */
contract UserRegistry is Ownable {
    struct UserProfile {
        string ipfsHash; // Hash pointing to off-chain profile data (e.g., JSON on IPFS)
        bool isActive;   // Flag to indicate if the user account is active
        uint256 registrationTimestamp; // Timestamp of registration
    }

    mapping(address => UserProfile) public userProfiles;
    mapping(address => bool) public isUserRegistered;

    event UserRegistered(address indexed user, string ipfsHash, uint256 timestamp);
    event UserProfileUpdated(address indexed user, string newIpfsHash, uint256 timestamp);
    event UserDeactivated(address indexed user, uint256 timestamp);
    event UserReactivated(address indexed user, uint256 timestamp);

    // Modifier to check if the caller is a registered user
    modifier onlyRegisteredUser() {
        require(isUserRegistered[msg.sender], "UserRegistry: Caller is not registered");
        _;
    }

    // Modifier to check if a user exists
    modifier userExists(address _user) {
        require(isUserRegistered[_user], "UserRegistry: User does not exist");
        _;
    }

    constructor() Ownable(msg.sender) {} // Set initial owner

    /**
     * @dev Registers a new user or updates the profile hash for an existing, active user.
     * @param _ipfsHash The hash (e.g., IPFS CID) pointing to the user's profile data.
     */
    function registerOrUpdateUser(string memory _ipfsHash) external {
        require(bytes(_ipfsHash).length > 0, "UserRegistry: IPFS hash cannot be empty");

        if (isUserRegistered[msg.sender]) {
            // Update existing user profile
            require(userProfiles[msg.sender].isActive, "UserRegistry: Cannot update deactivated profile");
            userProfiles[msg.sender].ipfsHash = _ipfsHash;
            emit UserProfileUpdated(msg.sender, _ipfsHash, block.timestamp);
        } else {
            // Register new user
            userProfiles[msg.sender] = UserProfile({
                ipfsHash: _ipfsHash,
                isActive: true,
                registrationTimestamp: block.timestamp
            });
            isUserRegistered[msg.sender] = true;
            emit UserRegistered(msg.sender, _ipfsHash, block.timestamp);
        }
    }

    /**
     * @dev Allows a user to deactivate their own profile.
     */
    function deactivateUser() external onlyRegisteredUser {
        require(userProfiles[msg.sender].isActive, "UserRegistry: Profile already deactivated");
        userProfiles[msg.sender].isActive = false;
        emit UserDeactivated(msg.sender, block.timestamp);
    }

    /**
     * @dev Allows a user to reactivate their own profile.
     * They might need to provide an updated IPFS hash if required by frontend logic.
     */
    function reactivateUser() external onlyRegisteredUser {
        require(!userProfiles[msg.sender].isActive, "UserRegistry: Profile already active");
        userProfiles[msg.sender].isActive = true;
        emit UserReactivated(msg.sender, block.timestamp);
        // Consider emitting UserProfileUpdated if hash needs update upon reactivation
    }

    /**
     * @dev Retrieves the profile data for a given user address.
     * @param _user The address of the user.
     * @return UserProfile The user's profile struct.
     */
    function getUserProfile(address _user) external view userExists(_user) returns (UserProfile memory) {
        return userProfiles[_user];
    }

    /**
     * @dev Allows the contract owner (admin) to deactivate a user profile.
     * Useful for moderation or compliance reasons.
     * @param _user The address of the user to deactivate.
     */
    function adminDeactivateUser(address _user) external onlyOwner userExists(_user) {
         require(userProfiles[_user].isActive, "UserRegistry: Profile already deactivated");
         userProfiles[_user].isActive = false;
         emit UserDeactivated(_user, block.timestamp);
    }

     /**
     * @dev Allows the contract owner (admin) to reactivate a user profile.
     * @param _user The address of the user to reactivate.
     */
    function adminReactivateUser(address _user) external onlyOwner userExists(_user) {
         require(!userProfiles[_user].isActive, "UserRegistry: Profile already active");
         userProfiles[_user].isActive = true;
         emit UserReactivated(_user, block.timestamp);
    }
}
