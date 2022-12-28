// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { IERC20Upgradeable, SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { ERC165CheckerUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import { ILearnToEarn, Course, Learner } from "./interfaces/ILearnToEarn.sol";
import { INFTReward } from "./interfaces/INFTReward.sol";

contract LearnToEarn is ReentrancyGuardUpgradeable, OwnableUpgradeable, ILearnToEarn {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ERC165CheckerUpgradeable for address;

    // courseId => Course
    mapping(bytes32 => Course) private courseData;

    // courseId => learnerAddress => Learner
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
        //slither-disable-next-line incorrect-equality
        require(courseData[_courseId].creator == _msgSender(), "caller is not course creator");
        _;
    }

    /* -----------INITILIZER----------- */

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
     * @param _timeEndBonus end date will finish bonus or duration to receive bonus after enrolling in course
     * @param _isUsingDuration Using duration for rewarding (true) or using end time (false)
     * @param _isBonusToken Awards is token (true) or NFT (false)
     *
     * emit {CreatedCourse} event
     */
    function createCourse(
        address _rewardAddress,
        uint256 _budget,
        uint256 _bonus,
        uint256 _timeEndBonus,
        bool _isUsingDuration,
        bool _isBonusToken
    ) external nonZero(_budget) nonZero(_bonus) nonReentrant {
        require(_rewardAddress != address(0), "Invalid reward address");
        require(_budget >= _bonus, "Invalid budget");
        require((_isUsingDuration && _timeEndBonus > 0) || (_timeEndBonus > block.timestamp), "Invalid time end bonus");

        bytes32 _courseId = _generateCourseId();
        bool _canMintNFT = false;
        if (!_isBonusToken) {
            // * Using ERC165 to check whether input contract is using INFTReward interface and has `mint` function or not
            _canMintNFT = _rewardAddress.supportsInterface(type(INFTReward).interfaceId);

            if (!_canMintNFT) {
                require(IERC721Upgradeable(_rewardAddress).balanceOf(_msgSender()) >= _budget, "Balance of creator is not enough");
            }
        }

        courseData[_courseId] = Course({
            creator: _msgSender(),
            rewardAddress: _rewardAddress,
            budget: _budget,
            budgetAvailable: _budget,
            bonus: _bonus,
            totalLearnersClaimedBonus: 0,
            timeCreated: block.timestamp,
            timeEndBonus: _timeEndBonus,
            isUsingDuration: _isUsingDuration,
            isBonusToken: _isBonusToken,
            canMintNFT: _canMintNFT
        });

        if (_isBonusToken) {
            IERC20Upgradeable(_rewardAddress).safeTransferFrom(_msgSender(), address(this), _budget);
        }

        emit CreatedCourse(_courseId, _msgSender(), _rewardAddress, _bonus);
    }

    /**
     * @notice Add more budget to course
     * @param _courseId Id of course
     * @param _budget Budget that added to course
     *
     * emit {AddedBudget} events
     */
    function addBudget(bytes32 _courseId, uint256 _budget) external onlyCreator(_courseId) nonZero(_budget) nonReentrant {
        Course storage course = courseData[_courseId];
        course.budget += _budget;
        course.budgetAvailable += _budget;

        if (course.isBonusToken) {
            IERC20Upgradeable(course.rewardAddress).safeTransferFrom(_msgSender(), address(this), _budget);
        } else {
            if (!course.canMintNFT) {
                require(IERC721Upgradeable(course.rewardAddress).balanceOf(_msgSender()) >= course.budgetAvailable, "Balance of creator is not enough");
            }
        }

        emit AddedBudget(_courseId, _budget);
    }

    /**
     * @notice Mark learner completed course and transfer bonus to learner
     * @param _courseId Id of course
     * @param _learner Address of learner
     * @param _timeStarted Time when learner enrolled in course (miliseconds)
     * @param _nftIds List Id of nfts that learner will receive if bonus is nfts
     *
     * emit {ClaimedReward} events if learner can receive rewards
     * emit {CompletedCourse} events
     */
    function completeCourse(bytes32 _courseId, address _learner, uint256 _timeStarted, uint256[] memory _nftIds) external onlyCreator(_courseId) {
        Course storage course = courseData[_courseId];
        require(course.timeCreated <= _timeStarted && _timeStarted < block.timestamp, "Invalid time start");

        Learner storage learner = learnerData[_courseId][_learner];
        require(learner.timeCompleted == 0, "already completed");

        learner.timeStarted = _timeStarted;
        learner.timeCompleted = block.timestamp;

        if (canGetBonus(_courseId, _learner)) {
            course.budgetAvailable -= course.bonus;
            course.totalLearnersClaimedBonus++;

            learner.timeRewarded = block.timestamp;

            if (course.isBonusToken) {
                IERC20Upgradeable(course.rewardAddress).safeTransfer(_learner, course.bonus);
            } else {
                if (course.canMintNFT) {
                    for (uint256 i = 0; i < course.bonus; i++) {
                        learner.nftIds.push(INFTReward(course.rewardAddress).mint(_learner));
                    }
                } else {
                    require(_nftIds.length == course.bonus, "Not enough NFTs");

                    learner.nftIds = _nftIds;
                    for (uint256 i = 0; i < _nftIds.length; i++) {
                        IERC721Upgradeable(course.rewardAddress).safeTransferFrom(_msgSender(), _learner, _nftIds[i]);
                    }
                }
            }
            emit ClaimedReward(_courseId, _learner, course.rewardAddress, course.bonus, learner.nftIds);
        }

        emit CompletedCourse(_courseId, _learner);
    }

    /**
     * @notice Creator can withdraw tokens bonus after time bonus ended
     * @param _courseId Id of the course
     *
     * emit {WithdrawnBudget} events
     */
    function withdrawBudget(bytes32 _courseId) external onlyCreator(_courseId) {
        Course storage course = courseData[_courseId];
        require(course.isBonusToken, "Invalid action");
        require(course.budgetAvailable > 0, "Out of budget");
        require(course.isUsingDuration || block.timestamp > course.timeEndBonus, "Time bonus has not ended");

        uint256 _amount = course.budgetAvailable;

        course.budgetAvailable = 0;
        IERC20Upgradeable(course.rewardAddress).safeTransfer(course.creator, _amount);

        emit WithdrawnBudget(_courseId, course.creator, _amount);
    }

    /* --------VIEW FUNCTIONS-------- */

    /**
     * @notice Check whether a learner can get bonus
     */
    function canGetBonus(bytes32 _courseId, address _learner) public view returns (bool) {
        if (courseData[_courseId].budgetAvailable < courseData[_courseId].bonus || (learnerData[_courseId][_learner].timeRewarded > 0)) return false;

        if (courseData[_courseId].isUsingDuration) {
            return learnerData[_courseId][_learner].timeCompleted <= learnerData[_courseId][_learner].timeStarted + courseData[_courseId].timeEndBonus;
        }

        return learnerData[_courseId][_learner].timeCompleted <= courseData[_courseId].timeEndBonus;
    }

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
