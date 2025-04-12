// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./UserRegistry.sol"; // Assuming UserRegistry is in the same directory

/**
 * @title JobPosting
 * @dev Manages the creation and lifecycle of job postings on SkillBridge.
 */
contract JobPosting is Ownable {
    using Counters for Counters.Counter;

    // --- Structs and Enums ---

    enum JobStatus {
        Open,      // Job is open for proposals
        Assigned,  // Job has been assigned to a freelancer
        InProgress,// Work has started (relevant if Escrow manages milestones)
        Completed, // Job successfully completed and paid
        Cancelled, // Job cancelled by client before completion
        Disputed   // Job is under dispute (handled by Escrow/Dispute contract)
    }

    struct JobDetails {
        uint256 id;
        address client; // Address of the client who posted the job
        string detailsIpfsHash; // Hash pointing to detailed job description, requirements, budget etc. on IPFS
        uint256 postedTimestamp;
        uint256 assignedTimestamp; // Timestamp when job was assigned
        uint256 completionDeadline; // Optional deadline for the job
        address assignedFreelancer; // Address of the freelancer assigned to the job
        JobStatus status;
    }

    // --- State Variables ---

    Counters.Counter private _jobIds; // Counter for generating unique job IDs
    mapping(uint256 => JobDetails) public jobs; // Mapping from job ID to job details
    mapping(address => uint256[]) public clientJobs; // Mapping from client address to their job IDs
    UserRegistry public userRegistry; // Reference to the UserRegistry contract

    // --- Events ---

    event JobPosted(
        uint256 indexed jobId,
        address indexed client,
        string detailsIpfsHash,
        uint256 completionDeadline,
        uint256 timestamp
    );
    event JobAssigned(
        uint256 indexed jobId,
        address indexed freelancer,
        uint256 timestamp
    );
    event JobStatusUpdated(
        uint256 indexed jobId,
        JobStatus newStatus,
        uint256 timestamp
    );
     event JobDetailsUpdated(
        uint256 indexed jobId,
        string newDetailsIpfsHash,
        uint256 newCompletionDeadline,
        uint256 timestamp
    );


    // --- Modifiers ---

    modifier onlyRegisteredActiveUser(address _user) {
        require(userRegistry.isUserRegistered(_user), "JobPosting: User not registered");
        UserRegistry.UserProfile memory profile = userRegistry.getUserProfile(_user);
        require(profile.isActive, "JobPosting: User profile is not active");
        _;
    }

    modifier onlyJobClient(uint256 _jobId) {
        require(jobs[_jobId].client == msg.sender, "JobPosting: Caller is not the client of this job");
        _;
    }

     modifier jobExists(uint256 _jobId) {
        require(jobs[_jobId].id != 0, "JobPosting: Job does not exist"); // Assumes job ID 0 is invalid
        _;
    }

    // --- Constructor ---

    constructor(address _userRegistryAddress) Ownable(msg.sender) {
        require(_userRegistryAddress != address(0), "JobPosting: Invalid UserRegistry address");
        userRegistry = UserRegistry(_userRegistryAddress);
    }

    // --- Functions ---

    /**
     * @dev Allows a registered and active client to post a new job.
     * @param _detailsIpfsHash Hash pointing to off-chain job details.
     * @param _completionDeadline Optional deadline for the job (0 if none).
     */
    function postJob(string memory _detailsIpfsHash, uint256 _completionDeadline)
        external
        onlyRegisteredActiveUser(msg.sender)
        returns (uint256 jobId)
    {
        require(bytes(_detailsIpfsHash).length > 0, "JobPosting: Details IPFS hash cannot be empty");

        _jobIds.increment();
        jobId = _jobIds.current();

        jobs[jobId] = JobDetails({
            id: jobId,
            client: msg.sender,
            detailsIpfsHash: _detailsIpfsHash,
            postedTimestamp: block.timestamp,
            assignedTimestamp: 0,
            completionDeadline: _completionDeadline,
            assignedFreelancer: address(0),
            status: JobStatus.Open
        });

        clientJobs[msg.sender].push(jobId);

        emit JobPosted(jobId, msg.sender, _detailsIpfsHash, _completionDeadline, block.timestamp);
        return jobId;
    }

     /**
     * @dev Allows the client to update the details or deadline of an Open job.
     * @param _jobId The ID of the job to update.
     * @param _newDetailsIpfsHash The new hash for job details.
     * @param _newCompletionDeadline The new deadline (0 if none).
     */
    function updateJobDetails(uint256 _jobId, string memory _newDetailsIpfsHash, uint256 _newCompletionDeadline)
        external
        jobExists(_jobId)
        onlyJobClient(_jobId)
    {
        JobDetails storage job = jobs[_jobId];
        require(job.status == JobStatus.Open, "JobPosting: Can only update Open jobs");
        require(bytes(_newDetailsIpfsHash).length > 0, "JobPosting: Details IPFS hash cannot be empty");

        job.detailsIpfsHash = _newDetailsIpfsHash;
        job.completionDeadline = _newCompletionDeadline;

        emit JobDetailsUpdated(_jobId, _newDetailsIpfsHash, _newCompletionDeadline, block.timestamp);
    }


    /**
     * @dev Assigns a freelancer to a job. Typically called by the client or potentially an Escrow contract upon agreement.
     * @param _jobId The ID of the job.
     * @param _freelancer The address of the freelancer being assigned.
     */
    function assignJob(uint256 _jobId, address _freelancer)
        external
        jobExists(_jobId)
        onlyJobClient(_jobId) // Or potentially allow Escrow contract? Needs design decision.
        onlyRegisteredActiveUser(_freelancer) // Ensure freelancer is registered and active
    {
        JobDetails storage job = jobs[_jobId];
        require(job.status == JobStatus.Open, "JobPosting: Job is not Open");
        require(_freelancer != address(0), "JobPosting: Invalid freelancer address");

        job.assignedFreelancer = _freelancer;
        job.assignedTimestamp = block.timestamp;
        job.status = JobStatus.Assigned; // Or InProgress if Escrow is funded immediately

        emit JobAssigned(_jobId, _freelancer, block.timestamp);
        emit JobStatusUpdated(_jobId, job.status, block.timestamp);
    }

    /**
     * @dev Updates the status of a job. Can be called by client, freelancer, or Escrow contract depending on the transition.
     * Requires careful access control design based on the specific status change.
     * Example: Mark as InProgress (potentially by Escrow), Completed (by Escrow/Client), Cancelled (by Client).
     * @param _jobId The ID of the job.
     * @param _newStatus The new status for the job.
     */
    function updateJobStatus(uint256 _jobId, JobStatus _newStatus)
        external
        jobExists(_jobId)
        // Access control needs refinement based on who can trigger which status change
        // Example: onlyJobClient for Cancelled, maybe Escrow contract for Completed/Disputed
    {
        JobDetails storage job = jobs[_jobId];

        // --- Add specific logic and access control for each status transition ---
        if (_newStatus == JobStatus.Cancelled) {
            require(msg.sender == job.client, "JobPosting: Only client can cancel");
            require(job.status == JobStatus.Open || job.status == JobStatus.Assigned, "JobPosting: Can only cancel Open or Assigned jobs");
            // Add checks if escrow is funded - cancellation rules might differ
        } else if (_newStatus == JobStatus.Completed) {
             // Typically called by Escrow contract upon successful payout
             // require(msg.sender == escrowContractAddress, "JobPosting: Only Escrow can mark completed");
             require(job.status == JobStatus.InProgress || job.status == JobStatus.Assigned, "JobPosting: Job must be InProgress or Assigned to complete");
        } else if (_newStatus == JobStatus.InProgress) {
             // Potentially called by Escrow contract when funded, or client/freelancer confirms start
             require(job.status == JobStatus.Assigned, "JobPosting: Job must be Assigned to start progress");
        } else if (_newStatus == JobStatus.Disputed) {
             // Potentially called by Escrow contract when dispute initiated
             require(job.status == JobStatus.InProgress || job.status == JobStatus.Assigned, "JobPosting: Job must be InProgress or Assigned to dispute");
        } else {
            revert("JobPosting: Invalid or disallowed status transition");
        }

        job.status = _newStatus;
        emit JobStatusUpdated(_jobId, _newStatus, block.timestamp);
    }


    // --- View Functions ---

    /**
     * @dev Retrieves the details of a specific job.
     * @param _jobId The ID of the job.
     * @return JobDetails The details of the job.
     */
    function getJobDetails(uint256 _jobId) external view jobExists(_jobId) returns (JobDetails memory) {
        return jobs[_jobId];
    }

    /**
     * @dev Retrieves the list of job IDs posted by a specific client.
     * @param _client The address of the client.
     * @return uint256[] An array of job IDs.
     */
    function getJobsByClient(address _client) external view returns (uint256[] memory) {
        return clientJobs[_client];
    }

    /**
     * @dev Returns the total number of jobs posted.
     */
    function getTotalJobs() external view returns (uint256) {
        return _jobIds.current();
    }

    // --- Admin Functions ---

    /**
     * @dev Allows the contract owner to update the UserRegistry address.
     * @param _newUserRegistryAddress The new address of the UserRegistry contract.
     */
    function setUserRegistryAddress(address _newUserRegistryAddress) external onlyOwner {
         require(_newUserRegistryAddress != address(0), "JobPosting: Invalid UserRegistry address");
         userRegistry = UserRegistry(_newUserRegistryAddress);
    }
}
