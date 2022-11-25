// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface ILearnToEarn {
    event CreatedCourse(bytes32 indexed courseId, address creator, address token, uint256 maxRewardLearners);
    event AddedLesson(bytes32 indexed courseId, bytes32 indexed lessonId);
    event EnrolledCourse(bytes32 indexed courseId, address learner);
    event SubmitttedAssignment(bytes32 indexed courseId, bytes32 indexed lessonId, address learner);
    event ReviewedAssignment(bytes32 indexed courseId, bytes32[] lessonId, address indexed learner, bool[] isAccepted);
    event UpdatedMaxRewardLearners(bytes32 indexed courseId, uint256 maxRewardLearners);
    event UpdatedLesson(bytes32 indexed courseId, bytes32 indexed lessonId, bool isOwnAssignment);

    /**
     * @notice Create new course
     * @param _token Address of token that reward to student after completing course
     * @param _maxRewardLearners Number of learners can be rewards when completed course
     * @param _isRewardToken Awards is token (true) or NFT (false)
     * @param _awards Amount of token that reward to each student
     *
     * emit {CreatedCourse} event
     */
    function createCourse(address _token, uint256 _maxRewardLearners, uint256 _awards, bool _isRewardToken) external;

    /**
     * @notice Add new lesson to course
     * @param _courseId Id of course that want to add new lesson
     * @param _isOwnAssignment Define that lesson has assignment or not
     *
     * emit {AddedLesson} event
     */
    function addLesson(bytes32 _courseId, bool _isOwnAssignment) external;

    /**
     * @dev Call from backend
     * @notice Learner enroll in a course and start learning
     * @param _courseId If of course that learner enrolls
     * emit {EnrolledCourse} event
     */
    function enrollCourse(bytes32 _courseId, address _learner) external;

    /**
     * @dev Call from backend
     * @notice learner submitted assignment of a lesson
     * @param _courseId If of course
     * @param _lessonId If of lesson
     * @param _learner Address of learner
     *
     * emit {SubmitttedAssignment} event
     */
    function submitAssignment(bytes32 _courseId, bytes32 _lessonId, address _learner) external;

    /**
     * @notice Creator review asssignment of learner
     * @param _courseId If of course
     * @param _lessonId Array of lesson Id
     * @param _learner Address of learner
     * @param _isAccepted Array of decions accept or deny asssignment, follow by _lessonId
     */
    function reviewAssignment(bytes32 _courseId, bytes32[] memory _lessonId, address _learner, bool[] memory _isAccepted) external;

    /**
     * @notice Learner can claim reward after completing the course in deadline and max reward learners
     * @param _courseId If of course
     *
     * emit {ClaimedReward} event
     */
    function claimReward(bytes32 _courseId) external
}
