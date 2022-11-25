// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable, SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ILearnToEarn } from "./interfaces/ILearnToEarn.sol";
import { Course, Lesson, LearnerCourse, LearnerLesson, LearnerCourseStatus, LearnerLessonStatus } from "./libraries/Structs.sol";

contract LearnToEarn is ReentrancyGuardUpgradeable, OwnableUpgradeable, ILearnToEarn {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // courseId => Course
    mapping(bytes32 => Course) private courseData;

    // courseId => lessonId => Lesson
    mapping(bytes32 => mapping(bytes32 => Lesson)) private lessonData;

    // courseId => learnerAddress => LearnerCourse
    mapping(bytes32 => mapping(address => LearnerCourse)) private learnerCourseData;

    // courseId => lessonId => learnerAddress => LearnerLesson
    mapping(bytes32 => mapping(bytes32 => mapping(address => LearnerLesson))) private learnerLessonData;

    /**
     * @notice Throws if amount provided is zero
     */
    modifier nonZero(uint256 amount_) {
        require(amount_ > 0, "Zero amount");
        _;
    }

    /**
     * @notice Throws if called by any account other than the course creator
     */
    modifier onlyCreator(bytes32 _courseId) {
        require(courseData[_courseId].creator == _msgSender(), "caller is not course creator");
        _;
    }

    /**
     * @notice Initialize of contract (replace for constructor)
     */
    function initialize() public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
    }

    /* --------EXTERNAL FUNCTIONS-------- */

    /**
     * @notice Create new course
     * @param _token Address of token that reward to student after completing course
     * @param _maxRewardLearners Number of learners can be rewards when completed course
     * @param _isRewardToken Awards is token (true) or NFT (false)
     * @param _awards Amount of token that reward to each student
     *
     * emit {CreatedCourse} event
     */
    function createCourse(
        address _token,
        uint256 _maxRewardLearners,
        uint256 _awards,
        bool _isRewardToken
    ) external nonZero(_maxRewardLearners) nonZero(_awards) {
        require(_token != address(0), "Invalid token address");

        bytes32 _courseId = _generateCourseId();
        courseData[_courseId] = Course({
            creator: _msgSender(),
            token: _token,
            maxRewardLearners: _maxRewardLearners,
            totalRewardLearners: 0,
            awards: _awards,
            totalAssignments: 0,
            timeCreated: block.timestamp,
            isRewardToken: _isRewardToken
        });

        if (_isRewardToken) {
            IERC20Upgradeable(_token).safeTransferFrom(_msgSender(), address(this), _maxRewardLearners * _awards);
        }

        emit CreatedCourse(_courseId, _msgSender(), _token, _maxRewardLearners);
    }

    /**
     * @notice Add new lesson to course
     * @param _courseId Id of course that want to add new lesson
     * @param _isOwnAssignment Define that lesson has assignment or not
     *
     * emit {AddedLesson} event
     */
    function addLesson(bytes32 _courseId, bool _isOwnAssignment) external onlyCreator(_courseId) {
        bytes32 _lessonId = _generateLessonId(_courseId, 0);
        lessonData[_courseId][_lessonId] = Lesson({ isOwnAssignment: _isOwnAssignment, timeCreated: block.timestamp });
        if (_isOwnAssignment) courseData[_courseId].totalAssignments++;

        emit AddedLesson(_courseId, _lessonId);
    }

    /**
     * @dev Call from backend
     * @notice Learner enroll in a course and start learning
     * @param _courseId If of course that learner enrolls
     * emit {EnrolledCourse} event
     */
    function enrollCourse(bytes32 _courseId, address _learner) external onlyCreator(_courseId) {
        require(learnerCourseData[_courseId][_learner].status == LearnerCourseStatus.PENDING, "already enrolled");

        learnerCourseData[_courseId][_learner].status = LearnerCourseStatus.STARTED;
        learnerCourseData[_courseId][_learner].timeStarted = block.timestamp;

        emit EnrolledCourse(_courseId, _learner);
    }

    /**
     * @dev Call from backend
     * @notice learner submitted assignment of a lesson
     * @param _courseId If of course
     * @param _lessonId If of lesson
     * @param _learner Address of learner
     *
     * emit {SubmitttedAssignment} event
     */
    function submitAssignment(
        bytes32 _courseId,
        bytes32 _lessonId,
        address _learner
    ) external onlyCreator(_courseId) {
        require(learnerCourseData[_courseId][_learner].status == LearnerCourseStatus.STARTED, "Unenrolled or already completed course");
        require(lessonData[_courseId][_lessonId].isOwnAssignment, "Lesson does not has assignment");

        LearnerLesson storage learnerLesson = learnerLessonData[_courseId][_lessonId][_learner];
        require(learnerLesson.isAccepted == false, "Assignment is accepted");

        learnerLesson.status = LearnerLessonStatus.SUBMITTED;

        emit SubmitttedAssignment(_courseId, _lessonId, _learner);
    }

    /**
     * @notice Creator review asssignments of learner
     * @param _courseId If of course
     * @param _lessonId Array of lesson Id
     * @param _learner Address of learner
     * @param _isAccepted Array of decions accept or deny asssignment, follow by _lessonId
     *
     * emit {ReviewedAssignment} event
     */
    function reviewAssignment(
        bytes32 _courseId,
        bytes32[] memory _lessonId,
        address _learner,
        bool[] memory _isAccepted
    ) external onlyCreator(_courseId) {
        require(learnerCourseData[_courseId][_learner].status == LearnerCourseStatus.STARTED, "Unenrolled course");
        require(_lessonId.length == _isAccepted.length, "Arrays length mismatch");
        for (uint256 i = 0; i < _lessonId.length; i++) {
            LearnerLesson storage learnerLesson = learnerLessonData[_courseId][_lessonId[i]][_learner];
            if ((learnerLesson.status == LearnerLessonStatus.SUBMITTED) && lessonData[_courseId][_lessonId[i]].isOwnAssignment) {
                learnerLesson.status = LearnerLessonStatus.REVIEWED;
                learnerLesson.isAccepted = _isAccepted[i];

                if (_isAccepted[i]) {
                    learnerCourseData[_courseId][_learner].totalAssignmentsAccepted += 1;
                }
            }
        }

        if (learnerCourseData[_courseId][_learner].totalAssignmentsAccepted == courseData[_courseId].totalAssignments) {
            learnerCourseData[_courseId][_learner].status = LearnerCourseStatus.COMPLETED;
            learnerCourseData[_courseId][_learner].timeCompleted = block.timestamp;
        }

        emit ReviewedAssignment(_courseId, _lessonId, _learner, _isAccepted);
    }

    /**
     * @notice Learner can claim reward after completing the course in deadline and max reward learners
     * @param _courseId If of course
     *
     * emit {ClaimedReward} event
     */
    function claimReward(bytes32 _courseId) external {
        require(learnerCourseData[_courseId][_msgSender()].status == LearnerCourseStatus.COMPLETED, "Uncompleted course or already reward");

        Course storage course = courseData[_courseId];
        require(course.totalRewardLearners < course.maxRewardLearners, "Reach maximum reward learner");

        course.totalRewardLearners++;
        learnerCourseData[_courseId][_msgSender()].status = LearnerCourseStatus.REWARDED;

        if (course.isRewardToken) {
            IERC20Upgradeable(course.token).safeTransfer(_msgSender(), course.awards);
        }
    }

    /**
     * @notice Creator can set limit of reward learners
     * @param _courseId Id of course
     * @param _maxRewardLearners limit of reward learners
     * @emit {UpdatedMaxRewardLearners} event
     */
    function updateMaxRewardLearners(bytes32 _courseId, uint256 _maxRewardLearners) external onlyCreator(_courseId) {
        courseData[_courseId].maxRewardLearners = _maxRewardLearners;

        emit UpdatedMaxRewardLearners(_courseId, _maxRewardLearners);
    }

    /**
     * @notice Creator can update lesson of course
     * @param _courseId Id of course
     * @param _lessonId Id of lesson
     * @param _isOwnAssignment that lesson has assignment or not
     *
     * emit {UpdatedLesson} event
     */
    function updateLesson(
        bytes32 _courseId,
        bytes32 _lessonId,
        bool _isOwnAssignment
    ) external onlyCreator(_courseId) {
        require(lessonData[_courseId][_lessonId].timeCreated > 0, "Invalid lesson");

        lessonData[_courseId][_lessonId].isOwnAssignment = _isOwnAssignment;

        emit UpdatedLesson(_courseId, _lessonId, _isOwnAssignment);
    }

    /* --------PRIVATE FUNCTIONS-------- */

    /**
     * @notice Generates unique id hash based on _msgSender() address and previous block hash.
     * @param _nonce nonce
     * @return Id
     */
    function _generateId(uint256 _nonce) private view returns (bytes32) {
        return keccak256(abi.encodePacked(_msgSender(), blockhash(block.number - 1), _nonce));
    }

    /**
     * @notice Returns a new unique course id.
     * @return _courseId Id of the course.
     */
    function _generateCourseId() private view returns (bytes32 _courseId) {
        _courseId = _generateId(0);
        require(courseData[_courseId].timeCreated == 0, "duplicate course id");
    }

    /**
     * @notice Returns a new unique lesson id.
     * @param _courseId Id of the course
     * @param _nonce nonce
     * @return _lessonId Id of the lesson
     */
    function _generateLessonId(bytes32 _courseId, uint256 _nonce) private view returns (bytes32 _lessonId) {
        _lessonId = _generateId(_nonce);
        require(lessonData[_courseId][_lessonId].timeCreated == 0, "duplicate lesson id");
    }
}
