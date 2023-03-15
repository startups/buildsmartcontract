// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { LearnToEarn, Course } from "./LearnToEarn.sol";
import { ERC721Test } from "./ERC721Test.sol";

contract LearnToEarnTest {
    LearnToEarn learnToEarn;
    ERC721Test erc721Test;

    constructor() {
        learnToEarn = new LearnToEarn();
        learnToEarn.initialize();

        erc721Test = new ERC721Test("Certificate", "PIONCE");
    }

    function _generateId(uint256 _nonce) private view returns (bytes32) {
        return keccak256(abi.encodePacked(msg.sender, blockhash(block.number - 1), _nonce));
    }

    function test_createCourse() public {
        address rewardAddress = address(0x1);
        uint256 budget = 100;
        uint256 bonus = 10;
        uint256 timeStart = block.timestamp;
        uint256 timeEndBonus = timeStart + 1 days;
        bool isUsingDuration = true;
        bool isBonusToken = true;

        learnToEarn.createCourse(
            rewardAddress,
            budget,
            bonus,
            timeStart,
            timeEndBonus,
            isUsingDuration,
            isBonusToken
        );

        bytes32 courseId = _generateId(0);

        // Assert that the course data was stored correctly
        Course memory course = learnToEarn.getCourseData(courseId);
        assert(course.creator == address(this));
        assert(course.rewardAddress == rewardAddress);
        assert(course.budget == budget);
        assert(course.budgetAvailable == budget);
        assert(course.bonus == bonus);
        assert(course.timeCreated == timeStart);
        assert(course.timeEndBonus == timeEndBonus);
        assert(course.timeRemoved == 0);
        assert(course.isUsingDuration == isUsingDuration);
        assert(course.isBonusToken == isBonusToken);
        assert(course.canMintNFT == false);
    }
}