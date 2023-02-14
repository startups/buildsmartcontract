// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

struct Course {
    address creator;
    address rewardAddress;
    uint256 budget;
    uint256 budgetAvailable;
    uint256 bonus;
    uint256 totalLearnersClaimedBonus;
    uint256 timeCreated;
    uint256 timeEndBonus;
    uint256 timeRemoved;
    bool isBonusToken;
    bool canMintNFT;
    bool isUsingDuration;
}

struct Learner {
    uint256 timeStarted;
    uint256 timeCompleted;
    uint256 timeRewarded;
    uint256[] nftIds;
}


interface ILearnToEarn {
    event CreatedCourse(bytes32 indexed courseId, address creator, address token, uint256 bonus, uint256 timeStarted);
    event AddedBudget(bytes32 indexed courseId, uint256 budget);
    event CompletedCourse(bytes32 indexed courseId, address learner);
    event ClaimedReward(bytes32 indexed courseId, address indexed learner, address indexed rewardAddress, uint256 bonus, uint256[] nftIds);
    event WithdrawnBudget(bytes32 indexed courseId, address indexed creator, uint256 amount);
    event RemovedCourse(bytes32 indexed courseId, address indexed creator);

    /**
     * @notice Create new course
     * @param _rewardAddress Address of token that reward to student after completing course
     * @param _budget Total tokens/NFTs that reward
     * @param _bonus Bonus when learner completed course
     * @param _timeStart Start time of course
     * @param _timeEndBonus end date will finish bonus or duration to receive bonus after enrolling in course 
     * @param _isUsingDuration Using duration for rewarding (true) or using end time (false)
     * @param _isBonusToken Awards is token (true) or NFT (false)
     *
     * emit {CreatedCourse} event
     */
    function createCourse(address _rewardAddress, uint256 _budget, uint256 _bonus, uint256 _timeStart, uint256 _timeEndBonus, bool _isUsingDuration, bool _isBonusToken) external;

    /**
     * @notice Add more budget to course
     * @param _courseId Id of course
     * @param _budget Budget that added to course
     *
     * emit {AddedBudget} events
     */
    function addBudget(bytes32 _courseId, uint256 _budget) external;

    /**
     * @notice Mark as learner completed course when the user submitted all assignments and accepted by creator
     * @param _courseId Id of course
     * @param _learner Address of learner
     * @param _timeStarted Time when learner enrollred in course
     * @param _nftIds List Id of nfts that learner will receive
     */
    function completeCourse(bytes32 _courseId, address _learner, uint256 _timeStarted, uint256 _timeCompleted, uint256[] memory _nftIds) external;

    /**
     * @notice Creator can withdraw tokens bonus after time bonus ended
     * @param _courseId Id of the course
     */
    function withdrawBudget(bytes32 _courseId) external;
}
