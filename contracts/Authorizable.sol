// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract Authorizable is Ownable {
    event SetModerator(address indexed moderator);
    event RemovedModerator(address indexed moderator);

    // address => boolean
    mapping(address => bool) public moderators;

    modifier onlyModerators(address _moderator) {
        require(moderators[_moderator], "Caller is not moderator");
        _;
    }

    function setModerator(address _moderator) external onlyOwner {
        require(_moderator != address(0), "Invalid address");
        require(!moderators[_moderator], "already moderator");

        moderators[_moderator] = true;

        emit SetModerator(_moderator);
    }

    function removeModerator(address _moderator) external onlyOwner {
        require(_moderator != address(0), "Invalid address");
        require(moderators[_moderator], "not been moderator");

        moderators[_moderator] = false;

        emit RemovedModerator(_moderator);
    }
}
