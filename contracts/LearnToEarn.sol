// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { ILearnToEarn } from "./interfaces/ILearnToEarn.sol";
import { Course, Lesson, LearnerCourse, LearnerLesson, CourseStatus, LessonStatus, LearnerCourseStatus, LearnerLessonStatus } from "./libraries/Structs.sol";

contract LearnToEarn is ReentrancyGuardUpgradeable, OwnableUpgradeable, ILearnToEarn {
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
     * @param _budget Total token that can reward
     * @param _awards Amount of token that reward to each student
     *
     * emit {CreatedCourse} event
     */
    function createCourse(
        address _token,
        uint256 _budget,
        uint256 _awards
    ) external nonZero(_budget) nonZero(_awards) {
        require(_token != address(0), "Invalid token address");

        bytes32 _courseId = _generateCourseId();
        courseData[_courseId] = Course({
            creator: _msgSender(),
            token: _token,
            budget: _budget,
            budgetAvailable: _budget,
            awards: _awards,
            totalAssignments: 0,
            status: CourseStatus.CREATED
        });

        emit CreatedCourse(_courseId, _msgSender(), _token, _budget);
    }

    /**
     * @notice Release course to everyone in platform
     * @param _courseId Course's id that want to release
     *
     * emit {ReleasedCourse} event
     */
    function releaseCourse(bytes32 _courseId) external onlyCreator(_courseId) {
        require(courseData[_courseId].status == CourseStatus.CREATED, "Course is not created or already released");

        courseData[_courseId].status = CourseStatus.RELEASED;

        emit ReleasedCourse(_courseId);
    }

    /**
     * @notice Add new lesson to course
     * @param _courseId Id of course that want to add new lesson
     * @param _isOwnAssignment Define that lesson has assignment or not
     *
     * emit {AddedLesson} event
     */
    function addLesson(bytes32 _courseId, bool _isOwnAssignment) external onlyCreator(_courseId) {
        require(courseData[_courseId].status == CourseStatus.CREATED, "Course is not created or already released");

        bytes32 _lessonId = _generateLessonId(_courseId, 0);
        lessonData[_courseId][_lessonId] = Lesson({ isOwnAssignment: _isOwnAssignment, status: LessonStatus.CREATED });

        emit AddedLesson(_courseId, _lessonId);
    }

    /**
     * @notice Learner enroll in a course and start learning
     * @param _courseId If of course that learner enrolls
     *
     * emit {EnrolledCourse} event
     */
    function enrollCourse(bytes32 _courseId, address _learner) external onlyCreator(_courseId) {
        require(courseData[_courseId].status == CourseStatus.RELEASED, "Course is not released");
        require(courseData[_courseId].budgetAvailable >= courseData[_courseId].awards, "Awards is not enough");

        learnerCourseData[_courseId][_learner].status = LearnerCourseStatus.STARTED;
        courseData[_courseId].budgetAvailable -= courseData[_courseId].awards;

        emit EnrolledCourse(_courseId, _learner);
    }

    /**
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
        require(learnerCourseData[_courseId][_learner].status == LearnerCourseStatus.STARTED, "Invalid course");
        require(lessonData[_courseId][_lessonId].isOwnAssignment, "Lesson not has assignment");

        LearnerLesson storage learnerLesson = learnerLessonData[_courseId][_lessonId][_learner];
        require(learnerLesson.isAccepted == false, "Assignment is accepted");

        learnerLesson.status = LearnerLessonStatus.SUBMITTED;

        emit SubmitttedAssignment(_courseId, _lessonId, _learner);
    }

    /**
     * @notice Creator review asssignment of learner
     * @param _courseId If of course
     * @param _lessonId Array of lesson Id
     * @param _learner Address of learner
     * @param _isAccepted Array of decions accept or deny asssignment, follow by _lessonId
     */
    function reviewAssignment(
        bytes32 _courseId,
        bytes32[] memory _lessonId,
        address _learner,
        bool[] memory _isAccepted
    ) external onlyCreator(_courseId) {
        require(learnerCourseData[_courseId][_learner].status == LearnerCourseStatus.STARTED, "Invalid course");
        require(_lessonId.length == _isAccepted.length, "arrays length mismatch");
        for (uint256 i = 0; i < _lessonId.length; i++) {
            LearnerLesson storage learnerlesson = learnerLessonData[_courseId][_lessonId[i]][_learner];
            if (lessonData[_courseId][_lessonId[i]].isOwnAssignment && (learnerlesson.status != LearnerLessonStatus.PENDING) && !learnerlesson.isAccepted) {
                learnerlesson.status = LearnerLessonStatus.REVIEWED;
                learnerlesson.isAccepted = _isAccepted[i];
            }
        }
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
        require(courseData[_courseId].status == CourseStatus.PENDING, "duplicate course id");
    }

    /**
     * @notice Returns a new unique lesson id.
     * @param _courseId Id of the course
     * @param _nonce nonce
     * @return _lessonId Id of the lesson
     */
    function _generateLessonId(bytes32 _courseId, uint256 _nonce) private view returns (bytes32 _lessonId) {
        _lessonId = _generateId(_nonce);
        require(lessonData[_courseId][_lessonId].status == LessonStatus.PENDING, "duplicate lesson id");
    }
}
