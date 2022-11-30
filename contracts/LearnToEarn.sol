// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { IERC20Upgradeable, SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { ERC165CheckerUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import { ILearnToEarn } from "./interfaces/ILearnToEarn.sol";
import { INFTReward } from "./interfaces/INFTReward.sol";
import { Course, Learner } from "./libraries/Structs.sol";

contract LearnToEarn is ReentrancyGuardUpgradeable, OwnableUpgradeable, ILearnToEarn {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ERC165CheckerUpgradeable for address;

    uint256 public constant REWARD_COMPLETED_DURATION = 60 days;

    // courseId => Course
    mapping(bytes32 => Course) private courseData;

    // courseId => learnerAddress => LearnerCourse
    mapping(bytes32 => mapping(address => Learner)) private learnerData;

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
     * @param _rewardAddress Address of token that reward to student after completing course
     * @param _budget Total tokens/NFTs that reward
     * @param _bonus Bonus when learner completed course
     * @param _isBonusToken Awards is token (true) or NFT (false)
     *
     * emit {CreatedCourse} event
     */
    function createCourse(address _rewardAddress, uint256 _budget, uint256 _bonus, bool _isBonusToken) external nonZero(_bonus) nonZero(_budget) nonReentrant {
        require(_rewardAddress != address(0), "Invalid rewardAddress address");
        require(_budget > _bonus, "Invalid budget");

        bytes32 _courseId = _generateCourseId();
        bool _canMintNFT = false;
        if (!_isBonusToken) {
            _canMintNFT = _rewardAddress.supportsInterface(type(INFTReward).interfaceId);
        }

        courseData[_courseId] = Course({
            creator: _msgSender(),
            rewardAddress: _rewardAddress,
            budget: _budget,
            budgetAvailable: _budget,
            bonus: _bonus,
            totalLearnersClaimedBonus: 0,
            timeCreated: block.timestamp,
            isBonusToken: _isBonusToken,
            canMintNFT: _canMintNFT
        });

        if (_isBonusToken) {
            IERC20Upgradeable(_rewardAddress).safeTransferFrom(_msgSender(), address(this), _budget);
        }

        emit CreatedCourse(_courseId, _msgSender(), _rewardAddress, _bonus);
    }

    /**
     * @notice Mark learner completed course when the user submitted all assignments and accepted by creator
     * @param _courseId Id of course
     * @param _learner Address of learner
     * @param _timeStarted Time when learner enrolled in course
     * @param _nftIds List Id of nfts that learner will receive
     */
    function completeCourse(bytes32 _courseId, address _learner, uint256 _timeStarted, uint256[] memory _nftIds) external onlyCreator(_courseId) {
        Learner storage learner = learnerData[_courseId][_learner];

        require(learner.timeCompleted == 0, "already completed");

        learner.timeStarted = _timeStarted;
        learner.timeCompleted = block.timestamp;

        Course storage course = courseData[_courseId];
        if ((course.budgetAvailable > course.bonus) && (learner.timeCompleted < learner.timeStarted + REWARD_COMPLETED_DURATION)) {
            learner.canClaimReward = true;
            course.budgetAvailable -= course.bonus;
            
            if (!course.canMintNFT) {
                require(_nftIds.length == course.bonus, "Array nft is not enough");
                learner.nftIds = _nftIds;
                for (uint256 i = 0; i < _nftIds.length; i++) {
                    IERC721Upgradeable(course.rewardAddress).safeTransferFrom(_msgSender(), address(this), _nftIds[i]);
                }
            }
        }

        emit CompletedCourse(_courseId, _learner);
    }

    /**
     * @notice Learner can claim reward after completing the course in deadline and max reward learners
     * @param _courseId If of course
     * @param _uri Link ipfs metadata of NFT
     *
     * emit {ClaimedReward} event
     */
    function claimReward(bytes32 _courseId, string memory _uri) external {
        Learner storage learner = learnerData[_courseId][_msgSender()];

        require(learner.timeCompleted > 0, "Uncompleted course");
        require(learner.timeRewarded == 0, "already claimed");
        require(learner.canClaimReward, "Not allowed");

        learner.timeRewarded = block.timestamp;
        Course storage course = courseData[_courseId];
        course.totalLearnersClaimedBonus++;

        if (course.isBonusToken) {
            IERC20Upgradeable(course.rewardAddress).safeTransfer(_msgSender(), course.bonus);
        } else {
            if (course.canMintNFT) {
                for (uint256 i = 0; i < course.bonus; i++) {
                    INFTReward(course.rewardAddress).mint(_msgSender(), _uri);
                }
            } else {
                for (uint256 i = 0; i < learner.nftIds.length; i++) {
                    IERC721Upgradeable(courseData[_courseId].rewardAddress).safeTransferFrom(address(this), _msgSender(), learner.nftIds[i]);
                }
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
        course.budget += _budget;
        course.budgetAvailable += _budget;

        if (course.isBonusToken) {
            IERC20Upgradeable(course.rewardAddress).safeTransferFrom(_msgSender(), address(this), _budget);
        }

        emit AddedBudget(_courseId, _budget);
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
     * @notice Get learner course details
     * @param _courseId Id of course
     * @param _learner Address of learner
     * @return Details of learner course
     */
    function getLearnerData(bytes32 _courseId, address _learner) external view returns (Learner memory) {
        return learnerData[_courseId][_learner];
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
}
