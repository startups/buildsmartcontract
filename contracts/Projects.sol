// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import {Project, ProjectLibrary} from "./libraries/ProjectLibrary.sol";
import {Packages} from "./Packages.sol";

contract Projects is Packages {
    using ProjectLibrary for Project;

    mapping(bytes32 => Project) internal projectData;

    /**
     * @dev Creates project proposal
     * @param token_ project token address
     * @param budget_ total budget
     */
    function _createProject(
        bytes32 projectId_,
        address token_,
        uint256 budget_
    ) internal {
        projectData[projectId_]._createProject(token_, budget_);
    }

    /**
     * @dev Approves project
     * @param projectId_ Id of the project
     */
    function _approveProject(bytes32 projectId_) internal {
        projectData[projectId_]._approveProject();
    }

    /**
     * @dev Starts project
     */
    function _startProject(
        bytes32 projectId_,
        address tokenFactory_
    ) internal {
        projectData[projectId_]._startProject(
            tokenFactory_
        );
    }

    /**
     * @dev Finishes project
     * @param projectId_ Id of the project
     */
    function _finishProject(bytes32 projectId_, address treasury_) internal {
        projectData[projectId_]._finishProject(treasury_);
    }

    /**
     * @dev Creates package in project, check if there is budget available
     * allocates budget and increase total number of packages
     * @param projectId_ Id of the project
     * @param totalBudget_ total budget MGP + Bonus
     * @param count_ total count of packages
     */
    function _reservePackagesBudget(
        bytes32 projectId_,
        uint256 totalBudget_,
        uint256 count_
    ) internal {
        projectData[projectId_]._reservePackagesBudget(totalBudget_, count_);
    }

    function _revertPackageBudget(
        bytes32 projectId_,
        uint256 budgetToBeReverted_
    ) internal {
        projectData[projectId_]._revertPackageBudget(budgetToBeReverted_);
    }

    /**
     * @dev Finishes package in project
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */
    function _finishPackage(bytes32 projectId_, bytes32 packageId_)
        internal
        override
        returns (uint256 budgetLeft_)
    {
        budgetLeft_ = super._finishPackage(projectId_, packageId_);
        projectData[projectId_]._finishPackage(budgetLeft_);
    }

    /**
     * @dev Sends observer fee after package is finished
     * @param projectId_ Id of the project
     * @param amount_ amount to pay
     */
    function _pay(bytes32 projectId_, uint256 amount_) internal {
        projectData[projectId_]._pay(amount_);
    }

    /**
     * @dev Returns project data for given project id.
     * @param projectId_ project ID
     * @return projectData_
     */
    function getProjectData(bytes32 projectId_)
        external
        view
        returns (Project memory)
    {
        return projectData[projectId_];
    }
}
