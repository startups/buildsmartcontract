// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface ILearnToEarn {
    event CreatedCourse(bytes32 indexed courseId, address creator, address token, uint256 bonus);
    event AddedBudget(bytes32 indexed courseId, uint256 budget);
    event ClaimedReward(bytes32 indexed courseId, address learner);
    event CompletedCourse(bytes32 indexed courseId, address learner);

    /**
     * @notice Create new course
     * @param _rewardAddress Address of token that reward to student after completing course
     * @param _budget Total tokens/NFTs that reward
     * @param _bonus Bonus when learner completed course
     * @param _isBonusToken Awards is token (true) or NFT (false)
     *
     * emit {CreatedCourse} event
     */
    function createCourse(
        address _rewardAddress,
        uint256 _budget,
        uint256 _bonus,
        bool _isBonusToken
    ) external;

    /**
     * @notice Mark as learner completed course when the user submitted all assignments and accepted by creator
     * @param _courseId Id of course
     * @param _learner Address of learner
     * @param _timeStarted Time when learner enrollred in course
     * @param _nftId List Id of nfts that learner will receive
     */
    function completeCourse(bytes32 _courseId, address _learner, uint256 _timeStarted, uint256[] memory _nftId) external;

    /**
     * @notice Learner can claim reward after completing the course in deadline and max reward learners
     * @param _courseId If of course
     * @param _uri Link ipfs metadata of NFT
     *
     * emit {ClaimedReward} event
     */
    function claimReward(bytes32 _courseId, string memory _uri) external;

    /**
     * @notice Add more budget to course
     * @param _courseId Id of course
     * @param _budget Budget that added to course
     *
     * emit {AddedBudget} events
     */
    function addBudget(bytes32 _courseId, uint256 _budget) external;
}
