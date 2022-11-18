// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IERC20Upgradeable, SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ITokenFactory } from "../interfaces/ITokenFactory.sol";
import { Project } from "./Structs.sol";

library ProjectLibrary {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
	@notice Throws if there is no such project
	 */
    modifier onlyActiveProject(Project storage project_) {
        require(project_.timeCreated > 0, "no such project");
        _;
    }

    /**
     * @notice Creates project proposal
     * @param project_ reference to Project struct
     * @param token_ project token address
     * @param budget_ total budget
     */
    function _createProject(
        Project storage project_,
        address token_,
        uint256 budget_
    ) internal {
        project_.initiator = msg.sender;
        project_.token = token_;
        project_.budget = budget_;
        project_.timeCreated = block.timestamp;
        project_.isOwnToken = token_ != address(0);
    }

    /**
     * @notice Approves project
     * @param project_ reference to Project struct
     */
    function _approveProject(Project storage project_) internal onlyActiveProject(project_) {
        require(project_.timeApproved == 0, "already approved project");
        project_.timeApproved = block.timestamp;
    }

    /**
     * @notice Starts project, if project own token auto approve, otherwise deploys IOUToken, transfers fee to DAO wallet
     * @param project_ reference to Project struct
     * @param tokenFactory_ address of token factory contract
     */
    function _startProject(Project storage project_, address tokenFactory_, string memory name_, string memory symbol_) internal {
        require(project_.timeApproved > 0, "project is not approved");
        require(project_.timeStarted == 0, "project already started");

        project_.timeStarted = block.timestamp;

        if (project_.isOwnToken) {
            IERC20Upgradeable(project_.token).safeTransferFrom(msg.sender, address(this), project_.budget);
        } else {
            project_.token = ITokenFactory(tokenFactory_).deployToken(project_.budget, name_, symbol_);
        }
    }

    /**
     * @notice Finishes project, checks if already finished or unfinished packages left
     * unallocated budget returned to initiator or burned (in case of IOUToken)
     * @param project_ reference to Project struct
     */
    function _finishProject(Project storage project_) internal {
        require(project_.timeStarted > 0, "project not started yet");
        require(project_.timeFinished == 0, "already finished project");
        require(project_.totalPackages == project_.totalFinishedPackages, "unfinished packages left");
        project_.timeFinished = block.timestamp;
        uint256 budgetLeft_ = project_.budget - project_.budgetAllocated;
        if (budgetLeft_ > 0) {
            IERC20Upgradeable(project_.token).safeTransfer(project_.initiator, budgetLeft_);
        }
    }

    /**
     * @notice Creates package in project, check if there is budget available
     * allocates budget and increase total number of packages
     * @param project_ reference to Project struct
     * @param totalBudget_ total budget MGP + Bonus
     * @param count_ total count of packages
     */
    function _reservePackagesBudget(
        Project storage project_,
        uint256 totalBudget_,
        uint256 count_
    ) internal {
        require(project_.timeStarted > 0, "project is not started");
        require(project_.timeFinished == 0, "project is finished");
        require(project_.budget >= project_.budgetAllocated + totalBudget_, "not enough project budget left");
        project_.budgetAllocated += totalBudget_;
        project_.totalPackages += count_;
    }

    /**
     * @notice Get back package budget package
     * @param project_ Project reference address
     * @param budgetToBeReverted_ Budget amount to be reverted
     */
    function _revertPackageBudget(Project storage project_, uint256 budgetToBeReverted_) internal {
        project_.budgetAllocated -= budgetToBeReverted_;
        project_.totalPackages--;
    }

    /**
     * @notice Finishes package in project, budget left addded refunded back to project budget
     * increases total number of finished packages
     * @param project_ reference to Project struct
     * @param budgetLeft_ amount of budget left
     */
    function _finishPackage(Project storage project_, uint256 budgetLeft_) internal {
        if (budgetLeft_ > 0) project_.budgetAllocated -= budgetLeft_;
        project_.totalFinishedPackages++;
    }

    /**
     * @notice Pays from project's budget, increases budget paid
     * @param project_ reference to Project struct
     * @param amount_ amount to pay
     */
    function _pay(
        Project storage project_,
        address receiver_,
        uint256 amount_
    ) internal {
        project_.budgetPaid += amount_;
        IERC20Upgradeable(project_.token).safeTransfer(receiver_, amount_);
    }
}
