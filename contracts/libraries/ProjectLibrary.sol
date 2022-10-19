// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITokenFactory} from "../interfaces/ITokenFactory.sol";
import {IIOUToken} from "../interfaces/IIOUToken.sol";
import {Project} from "./Structs.sol";

library ProjectLibrary {
    using SafeERC20 for IERC20;

    /**
	@dev Throws if there is no such project
	 */
    modifier onlyExistingProject(Project storage project_) {
        require(project_.timeCreated != 0, "no such project");
        _;
    }

    /**
     * @dev Creates project proposal
     * @param project_ reference to Project struct
     * @param token_ project token address
     * @param budget_ total budget
     */
    function _createProject(
        Project storage project_,
        address token_,
        uint256 budget_
    ) public {
        project_.initiator = msg.sender;
        project_.token = token_;
        project_.budget = budget_;
        project_.timeCreated = block.timestamp;
        if (token_ != address(0)) {
            project_.isOwnToken = true;
            _approveProject(project_);
        }
    }

    /**
     * @dev Approves project
     * @param project_ reference to Project struct
     */
    function _approveProject(Project storage project_)
        public
        onlyExistingProject(project_)
    {
        require(project_.timeApproved == 0, "already approved project");
        project_.timeApproved = block.timestamp;
    }

    /**
     * @dev Starts project, if project own token auto approve, otherwise deploys IOUToken, transfers fee to DAO wallet
     * @param project_ reference to Project struct
     * @param treasury_ address of DAO wallet
     * @param tokenFactory_ address of token factory contract
     */
    function _startProject(
        Project storage project_,
        address treasury_,
        address tokenFactory_
    ) public onlyExistingProject(project_) {
        require(project_.timeStarted == 0, "project already started");
        require(project_.timeApproved != 0, "project is not approved");
        if (project_.isOwnToken) {
            IERC20(project_.token).safeTransferFrom(
                msg.sender,
                address(this),
                project_.budget
            );
            IERC20(project_.token).safeTransferFrom(
                msg.sender,
                treasury_,
                (project_.budget * 5) / 100
            );
        } else {
            project_.token = ITokenFactory(tokenFactory_).deployToken(
                project_.budget
            );
        }
        project_.budgetAllocated = 0;
        project_.budgetPaid = 0;
        project_.timeStarted = block.timestamp;
    }

    /**
     * @dev Finishes project, checks if already finished or unfinished packages left
     * unallocated budget returned to initiator or burned (in case of IOUToken)
     * @param project_ reference to Project struct
     */
    function _finishProject(Project storage project_)
        public
        onlyExistingProject(project_)
    {
        require(project_.timeFinished == 0, "already finished project");
        require(
            project_.totalPackages == project_.totalFinishedPackages,
            "unfinished packages left in project"
        );
        project_.timeFinished = block.timestamp;
        uint256 budgetLeft_ = project_.budget - project_.budgetAllocated;
        if (project_.timeStarted != 0 && budgetLeft_ != 0) {
            if (project_.isOwnToken)
                IERC20(project_.token).safeTransfer(
                    project_.initiator,
                    budgetLeft_
                );
            else IIOUToken(address(project_.token)).burn(budgetLeft_);
        }
    }

    /**
     * @dev Creates package in project, check if there is budget available
     * allocates budget and increase total number of packages
     * @param project_ reference to Project struct
     * @param totalBudget_ total budget MGP + Bonus
     * @param count_ total count of packages
     */
    function _reservePackagesBudget(
        Project storage project_,
        uint256 totalBudget_,
        uint256 count_
    ) public onlyExistingProject(project_) {
        require(project_.timeStarted != 0, "project is not started");
        require(project_.timeFinished == 0, "project is finished");
        uint256 _projectBudgetAvailable = project_.budget - project_.budgetAllocated;
        require(
            _projectBudgetAvailable >= totalBudget_,
            "not enough project budget left"
        );
        project_.budgetAllocated += totalBudget_;
        project_.totalPackages += count_;
    }

    function _revertPackageBudget(
        Project storage project_,
        uint256 budgetToBeReverted_
    ) public onlyExistingProject(project_) {
        require(project_.timeStarted != 0, "project is not started");
        require(project_.timeFinished == 0, "project is finished");
        project_.budgetAllocated -= budgetToBeReverted_;
        project_.totalPackages -= 1;
    }

    /**
     * @dev Finishes package in project, budget left addded refunded back to project budget
     * increases total number of finished packages
     * @param project_ reference to Project struct
     * @param budgetLeft_ amount of budget left
     */
    function _finishPackage(Project storage project_, uint256 budgetLeft_)
        public
        onlyExistingProject(project_)
    {
        if (budgetLeft_ != 0) project_.budgetAllocated -= budgetLeft_;
        project_.totalFinishedPackages++;
    }

    /**
     * @dev Pays from project's budget, increases budget paid
     * @param project_ reference to Project struct
     * @param amount_ amount to pay
     */
    function _pay(Project storage project_, uint256 amount_)
        public
        onlyExistingProject(project_)
    {
        IERC20(project_.token).safeTransfer(msg.sender, amount_);
        project_.budgetPaid += amount_;
    }
}
