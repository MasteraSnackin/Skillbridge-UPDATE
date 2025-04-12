// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./UserRegistry.sol"; // Assuming UserRegistry is in the same directory
import "./JobPosting.sol";   // Assuming JobPosting is in the same directory

/**
 * @title Escrow
 * @dev Manages escrowed funds for jobs on SkillBridge using ERC20 tokens.
 * This is a basic version focusing on deposit, release, and cancellation before work starts.
 */
contract Escrow is Ownable {
    using SafeERC20 for IERC20;

    // --- Structs and Enums ---

    enum EscrowStatus {
        Created,   // Escrow record created, awaiting funds
        Funded,    // Funds deposited by the client
        Released,  // Funds released to the freelancer
        Cancelled, // Funds returned to the client (before work started)
        Disputed   // Dispute initiated (handled in later versions)
    }

    struct EscrowDetails {
        uint256 jobId;
        address client;
        address freelancer;
        address tokenAddress; // Address of the ERC20 token used for payment
        uint256 amount;       // Total amount to be held in escrow
        EscrowStatus status;
    }

    // --- State Variables ---

    mapping(uint256 => EscrowDetails) public escrows; // Mapping from jobId to escrow details
    UserRegistry public userRegistry;
    JobPosting public jobPosting;
    uint256 public platformFeePercent; // e.g., 5 for 5% fee (can be 0)
    address public feeRecipient; // Address where platform fees are sent

    // --- Events ---

    event EscrowCreated(uint256 indexed jobId, address indexed client, address indexed freelancer, address tokenAddress, uint256 amount);
    event EscrowFunded(uint256 indexed jobId, uint256 amount, uint256 timestamp);
    event EscrowReleased(uint256 indexed jobId, address indexed freelancer, uint256 amountPaid, uint256 feeAmount, uint256 timestamp);
    event EscrowCancelled(uint256 indexed jobId, address indexed client, uint256 amountReturned, uint256 timestamp);
    event PlatformFeeUpdated(uint256 newFeePercent, address indexed newFeeRecipient);

    // --- Modifiers ---

    modifier onlyRegisteredActiveUser(address _user) {
        require(userRegistry.isUserRegistered(_user), "Escrow: User not registered");
        UserRegistry.UserProfile memory profile = userRegistry.getUserProfile(_user);
        require(profile.isActive, "Escrow: User profile is not active");
        _;
    }

     modifier jobExistsInPostingContract(uint256 _jobId) {
        // Check if the job actually exists in the JobPosting contract
        // Note: JobPosting.jobs mapping is public, but accessing structs directly isn't straightforward.
        // A view function in JobPosting might be better, e.g., `jobExists(uint256 _jobId) view returns (bool)`
        // For now, we rely on the JobPosting contract's internal checks when updating status.
        // A basic check could be:
        require(jobPosting.getJobDetails(_jobId).id == _jobId, "Escrow: Job ID not found in JobPosting contract");
        _;
    }

    modifier onlyJobClient(uint256 _jobId) {
        require(escrows[_jobId].client == msg.sender, "Escrow: Caller is not the client for this escrow");
        _;
    }

     modifier escrowExists(uint256 _jobId) {
        require(escrows[_jobId].client != address(0), "Escrow: Escrow for this job does not exist");
        _;
    }

    // --- Constructor ---

    constructor(
        address _userRegistryAddress,
        address _jobPostingAddress,
        uint256 _initialFeePercent, // e.g., 5 for 5%
        address _initialFeeRecipient
    ) Ownable(msg.sender) {
        require(_userRegistryAddress != address(0), "Escrow: Invalid UserRegistry address");
        require(_jobPostingAddress != address(0), "Escrow: Invalid JobPosting address");
        require(_initialFeeRecipient != address(0), "Escrow: Invalid fee recipient address");
        require(_initialFeePercent <= 100, "Escrow: Fee percent cannot exceed 100"); // Basic sanity check

        userRegistry = UserRegistry(_userRegistryAddress);
        jobPosting = JobPosting(_jobPostingAddress);
        platformFeePercent = _initialFeePercent;
        feeRecipient = _initialFeeRecipient;
    }

    // --- Functions ---

    /**
     * @dev Creates an escrow record for a job. Called typically after a job is assigned.
     * @param _jobId The ID of the job in the JobPosting contract.
     * @param _tokenAddress The address of the ERC20 token for payment.
     * @param _amount The total amount to be escrowed.
     */
    function createEscrow(uint256 _jobId, address _tokenAddress, uint256 _amount)
        external
        jobExistsInPostingContract(_jobId)
        // Access Control: Should only the client or maybe the JobPosting contract call this?
        // Let's assume only the client can initiate for now.
        onlyRegisteredActiveUser(msg.sender)
    {
        JobPosting.JobDetails memory job = jobPosting.getJobDetails(_jobId);
        require(job.client == msg.sender, "Escrow: Only the job client can create the escrow");
        require(job.status == JobPosting.JobStatus.Assigned, "Escrow: Job must be in Assigned status");
        require(job.assignedFreelancer != address(0), "Escrow: Job must have an assigned freelancer");
        require(escrows[_jobId].client == address(0), "Escrow: Escrow already exists for this job");
        require(_tokenAddress != address(0), "Escrow: Invalid token address");
        require(_amount > 0, "Escrow: Amount must be greater than zero");
        // Ensure freelancer is also registered and active
        require(userRegistry.isUserRegistered(job.assignedFreelancer), "Escrow: Freelancer not registered");
        UserRegistry.UserProfile memory freelancerProfile = userRegistry.getUserProfile(job.assignedFreelancer);
        require(freelancerProfile.isActive, "Escrow: Freelancer profile is not active");


        escrows[_jobId] = EscrowDetails({
            jobId: _jobId,
            client: msg.sender,
            freelancer: job.assignedFreelancer,
            tokenAddress: _tokenAddress,
            amount: _amount,
            status: EscrowStatus.Created
        });

        emit EscrowCreated(_jobId, msg.sender, job.assignedFreelancer, _tokenAddress, _amount);
    }

    /**
     * @dev Client deposits funds into the escrow.
     * Requires prior approval for the contract to spend tokens on behalf of the client.
     * @param _jobId The ID of the job.
     */
    function depositFunds(uint256 _jobId)
        external
        escrowExists(_jobId)
        onlyJobClient(_jobId)
    {
        EscrowDetails storage escrow = escrows[_jobId];
        require(escrow.status == EscrowStatus.Created, "Escrow: Escrow not in Created status");

        IERC20 token = IERC20(escrow.tokenAddress);
        // Transfer funds from client to this contract
        token.safeTransferFrom(msg.sender, address(this), escrow.amount);

        escrow.status = EscrowStatus.Funded;

        // Optionally update JobPosting status to InProgress
        // Consider potential re-entrancy if JobPosting calls back into Escrow
        // It might be safer for the frontend to trigger the JobPosting status update separately
        // jobPosting.updateJobStatus(_jobId, JobPosting.JobStatus.InProgress);

        emit EscrowFunded(_jobId, escrow.amount, block.timestamp);
    }

     /**
     * @dev Client releases funds to the freelancer upon satisfactory completion.
     * @param _jobId The ID of the job.
     */
    function releaseFunds(uint256 _jobId)
        external
        escrowExists(_jobId)
        onlyJobClient(_jobId)
    {
        EscrowDetails storage escrow = escrows[_jobId];
        require(escrow.status == EscrowStatus.Funded, "Escrow: Escrow not funded");
        // Add checks based on JobPosting status if needed (e.g., require work submitted)

        IERC20 token = IERC20(escrow.tokenAddress);
        uint256 totalAmount = escrow.amount;
        uint256 feeAmount = (totalAmount * platformFeePercent) / 100;
        uint256 amountToFreelancer = totalAmount - feeAmount;

        require(amountToFreelancer > 0, "Escrow: Amount after fee is zero or less"); // Sanity check

        // Transfer fee to platform recipient
        if (feeAmount > 0) {
            token.safeTransfer(feeRecipient, feeAmount);
        }

        // Transfer remaining amount to freelancer
        token.safeTransfer(escrow.freelancer, amountToFreelancer);

        escrow.status = EscrowStatus.Released;

        // Update JobPosting status to Completed
        // Again, consider re-entrancy risks. Safer if frontend triggers this.
        // jobPosting.updateJobStatus(_jobId, JobPosting.JobStatus.Completed);

        emit EscrowReleased(_jobId, escrow.freelancer, amountToFreelancer, feeAmount, block.timestamp);
    }

    /**
     * @dev Client cancels the job and retrieves funds *before* work has effectively started.
     * This simple version assumes cancellation is only possible when Funded but not yet Released/Disputed.
     * More complex logic needed if milestones or work verification exist.
     * @param _jobId The ID of the job.
     */
    function cancelEscrow(uint256 _jobId)
        external
        escrowExists(_jobId)
        onlyJobClient(_jobId)
    {
        EscrowDetails storage escrow = escrows[_jobId];
        // Allow cancellation only if funded but not yet released or disputed
        require(escrow.status == EscrowStatus.Funded, "Escrow: Escrow not in cancellable state (must be Funded)");
        // Potentially check JobPosting status as well (e.g., not InProgress if that's tracked)
        // require(jobPosting.getJobDetails(_jobId).status == JobPosting.JobStatus.Assigned, "Escrow: Job status prevents cancellation");


        IERC20 token = IERC20(escrow.tokenAddress);
        uint256 amountToReturn = escrow.amount;

        // Return full amount to client
        token.safeTransfer(escrow.client, amountToReturn);

        escrow.status = EscrowStatus.Cancelled;

        // Update JobPosting status to Cancelled
        // jobPosting.updateJobStatus(_jobId, JobPosting.JobStatus.Cancelled);

        emit EscrowCancelled(_jobId, escrow.client, amountToReturn, block.timestamp);
    }


    // --- View Functions ---

    function getEscrowDetails(uint256 _jobId) external view escrowExists(_jobId) returns (EscrowDetails memory) {
        return escrows[_jobId];
    }

    // --- Admin Functions ---

    /**
     * @dev Updates the platform fee percentage and recipient address.
     * @param _newFeePercent The new fee percentage (e.g., 5 for 5%).
     * @param _newFeeRecipient The new address to receive fees.
     */
    function setPlatformFee(uint256 _newFeePercent, address _newFeeRecipient) external onlyOwner {
        require(_newFeeRecipient != address(0), "Escrow: Invalid fee recipient address");
        require(_newFeePercent <= 100, "Escrow: Fee percent cannot exceed 100");
        platformFeePercent = _newFeePercent;
        feeRecipient = _newFeeRecipient;
        emit PlatformFeeUpdated(_newFeePercent, _newFeeRecipient);
    }

     /**
     * @dev Allows the owner to update the UserRegistry address.
     * @param _newUserRegistryAddress The new address of the UserRegistry contract.
     */
    function setUserRegistryAddress(address _newUserRegistryAddress) external onlyOwner {
         require(_newUserRegistryAddress != address(0), "Escrow: Invalid UserRegistry address");
         userRegistry = UserRegistry(_newUserRegistryAddress);
    }

     /**
     * @dev Allows the owner to update the JobPosting address.
     * @param _newJobPostingAddress The new address of the JobPosting contract.
     */
    function setJobPostingAddress(address _newJobPostingAddress) external onlyOwner {
         require(_newJobPostingAddress != address(0), "Escrow: Invalid JobPosting address");
         jobPosting = JobPosting(_newJobPostingAddress);
    }

    // --- Fallback/Receive ---
    // Add receive() external payable {} if you plan to handle native currency (e.g., MATIC) directly.
    // For ERC20 only, it's not strictly necessary but doesn't hurt.
    receive() external payable {}
}
