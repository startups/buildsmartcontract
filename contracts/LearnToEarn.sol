// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable, SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { Authorizable } from "./Authorizable.sol";
import { ILearnToEarn } from "./interfaces/ILearnToEarn.sol";
import { INFTReward } from "./interfaces/INFTReward.sol";
import { Course, Lesson, LearnerCourse, LearnerLesson, CourseStatus, LessonStatus, LearnerCourseStatus, LearnerLessonStatus } from "./libraries/Structs.sol";

contract LearnToEarn is ReentrancyGuardUpgradeable, Authorizable, ILearnToEarn {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 public constant MAX_DEPOSITE = 30;

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
        __ReentrancyGuard_init();
    }

    /* --------EXTERNAL FUNCTIONS-------- */

    /**
     * @notice Create new course
     * @param _rewardAddress Address of token that reward to student after completing course
     * @param _budget Total tokens/NFTs that reward
     * @param _bonus Bonus when learner completed course
     * @param _isRewardToken Awards is token (true) or NFT (false)
     * @param _isOwnNFT If awards is NFT, creator own nfts or not // default false for token
     * @param _nftIds Array of NFTs' id
     *
     * emit {CreatedCourse} event
     */
    function createCourse(
        address _rewardAddress,
        uint256 _budget,
        uint256 _bonus,
        bool _isRewardToken,
        bool _isOwnNFT,
        uint256[] memory _nftIds
    ) external nonZero(_bonus) nonZero(_budget) nonReentrant {
        require(_rewardAddress != address(0), "Invalid rewardAddress address");
        require(_budget > _bonus, "Budget is not enough");

        bytes32 _courseId = _generateCourseId();
        courseData[_courseId] = Course({
            creator: _msgSender(),
            rewardAddress: _rewardAddress,
            bonus: _bonus,
            totalRewardLearners: 0,
            budget: _budget,
            budgetAvailable: _budget,
            totalAssignments: 0,
            nftIds: _nftIds,
            isRewardToken: _isRewardToken,
            isOwnNFT: _isOwnNFT,
            status: CourseStatus.PREPARING
        });

        if (_isRewardToken) {
            IERC20Upgradeable(_rewardAddress).safeTransferFrom(_msgSender(), address(this), _budget);
        } else {
            if (_isOwnNFT) {
                courseData[_courseId].budgetAvailable = 0;
            }
        }

        emit CreatedCourse(_courseId, _msgSender(), _rewardAddress, _bonus);
    }

    /**
     * @notice Deposite NFT to course because number of NFTs is too large
     * @param _courseId Id of course
     * @param _nftIds Array of NFTs' id
     */
    function depositAwards(bytes32 _courseId, uint256[] memory _nftIds) external onlyCreator(_courseId) {
        require(_nftIds.length <= MAX_DEPOSITE, "Reach max deposite (30)");
        require(!courseData[_courseId].isRewardToken && courseData[_courseId].isOwnNFT, "Invalid action");

        courseData[_courseId].budgetAvailable += _nftIds.length;

        for (uint256 i = 0; i < _nftIds.length; i++) {
            courseData[_courseId].nftIds.push(_nftIds[i]);
            IERC721Upgradeable(courseData[_courseId].rewardAddress).safeTransferFrom(_msgSender(), address(this), _nftIds[i]);
        }

        if (courseData[_courseId].nftIds.length >= courseData[_courseId].budget) {
            courseData[_courseId].status = CourseStatus.STARTED;
        }
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
        lessonData[_courseId][_lessonId] = Lesson({ isOwnAssignment: _isOwnAssignment, status: LessonStatus.CREATED });
        if (_isOwnAssignment) courseData[_courseId].totalAssignments++;

        emit AddedLesson(_courseId, _lessonId);
    }

    /**
     * @dev Moderators will call from backend
     * @notice Learner enroll in a course and start learning
     * @param _courseId If of course that learner enrolls
     * emit {EnrolledCourse} event
     */
    function enrollCourse(bytes32 _courseId, address _learner) external onlyModerators(_msgSender()) {
        require(learnerCourseData[_courseId][_learner].status == LearnerCourseStatus.PENDING, "already enrolled");

        learnerCourseData[_courseId][_learner].status = LearnerCourseStatus.STARTED;
        learnerCourseData[_courseId][_learner].timeStarted = block.timestamp;

        emit EnrolledCourse(_courseId, _learner);
    }

    /**
     * @dev Moderators will call from backend
     * @notice learner submitted assignment of a lesson
     * @param _courseId If of course
     * @param _lessonId If of lesson
     * @param _learner Address of learner
     *
     * emit {SubmitttedAssignment} event
     */
    function submitAssignment(bytes32 _courseId, bytes32 _lessonId, address _learner) external onlyModerators(_msgSender()) {
        require(learnerCourseData[_courseId][_learner].status == LearnerCourseStatus.STARTED, "Unenrolled or already completed course");
        require(lessonData[_courseId][_lessonId].isOwnAssignment, "Lesson does not has assignment");

        LearnerLesson storage learnerLesson = learnerLessonData[_courseId][_lessonId][_learner];
        require(!learnerLesson.isAccepted, "Assignment is accepted");

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
    function reviewAssignment(bytes32 _courseId, bytes32[] memory _lessonId, address _learner, bool[] memory _isAccepted) external onlyCreator(_courseId) {
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

            emit CompletedCourse(_courseId, _learner);
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
        require(course.budgetAvailable < course.bonus, "Awards is not enough");

        course.budgetAvailable -= course.bonus;
        course.totalRewardLearners++;
        learnerCourseData[_courseId][_msgSender()].status = LearnerCourseStatus.REWARDED;

        if (course.isRewardToken) {
            IERC20Upgradeable(course.rewardAddress).safeTransfer(_msgSender(), course.bonus);
        } else {
            if (course.isOwnNFT) {
                IERC721Upgradeable(course.rewardAddress).safeTransferFrom(address(this), _msgSender(), course.nftIds[course.totalRewardLearners]);
            } else {
                INFTReward(course.rewardAddress).mint(_msgSender());
            }
        }

        emit ClaimedReward(_courseId, _msgSender());
    }

    /**
     * @notice Add more budget to course
     * @param _courseId Id of course
     * @param _budget Budget that added to course
     *
     * emit {AddedBudget} events
     */
    function addBudget(bytes32 _courseId, uint256 _budget) external onlyCreator(_courseId) nonZero(_budget) nonReentrant {
        Course memory course = courseData[_courseId];
        courseData[_courseId].budget += _budget;

        if (!course.isRewardToken && course.isOwnNFT && (course.nftIds.length < course.budget)) {
            course.status = CourseStatus.PREPARING;
        } else {
            courseData[_courseId].budgetAvailable += _budget;
            IERC20Upgradeable(course.rewardAddress).safeTransferFrom(_msgSender(), address(this), _budget);
        }

        emit AddedBudget(_courseId, _budget);
    }

    /**
     * @notice Creator can update lesson of course
     * @param _courseId Id of course
     * @param _lessonId Id of lesson
     * @param _isOwnAssignment that lesson has assignment or not
     *
     * emit {UpdatedLesson} event
     */
    function updateLesson(bytes32 _courseId, bytes32 _lessonId, bool _isOwnAssignment) external onlyCreator(_courseId) {
        require(lessonData[_courseId][_lessonId].status == LessonStatus.CREATED, "Invalid lesson");

        lessonData[_courseId][_lessonId].isOwnAssignment = _isOwnAssignment;

        emit UpdatedLesson(_courseId, _lessonId, _isOwnAssignment);
    }

    /* --------VIEW FUNCTIONS-------- */

    /**
     * @notice Get course details
     * @param _courseId Id of course
     * @return Details of course
     */
    function getCourseData(bytes32 _courseId) external view returns (Course memory) {
        return courseData[_courseId];
    }

    /**
     * @notice Get lesson details
     * @param _courseId Id of course
     * @param _lessonId If of lesson
     * @return Details of lesson
     */
    function getLessonData(bytes32 _courseId, bytes32 _lessonId) external view returns (Lesson memory) {
        return lessonData[_courseId][_lessonId];
    }

    /**
     * @notice Get learner course details
     * @param _courseId Id of course
     * @param _learner Address of learner
     * @return Details of learner course
     */
    function getLearnerCourseData(bytes32 _courseId, address _learner) external view returns (LearnerCourse memory) {
        return learnerCourseData[_courseId][_learner];
    }

    /**
     * @notice Get learner lesson details
     * @param _courseId Id of course
     * @param _lessonId Id of lesson
     * @param _learner Address of learner
     * @return Details of learner lesson
     */
    function getLearnerLessonData(bytes32 _courseId, bytes32 _lessonId, address _learner) external view returns (LearnerLesson memory) {
        return learnerLessonData[_courseId][_lessonId][_learner];
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
