// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface IReBakedDAO {
    event UpdatedTreasury(address oldTreasury, address newTreasury);
    event CreatedProject(bytes32 indexed projectId, address initiator, address token, uint256 budget);
    event StartedProject(bytes32 indexed projectId);
    event ApprovedProject(bytes32 indexed projectId);
    event FinishedProject(bytes32 indexed projectId, uint256 budgetLeft);
    event CreatedPackage(bytes32 indexed projectId, bytes32 indexed packageId, uint256 budget, uint256 bonus, uint256 observerBudget);
    event AddedObservers(bytes32 indexed projectId, bytes32 indexed packageId, address[] observers);
    event RemovedObservers(bytes32 indexed projectId, bytes32 indexed packageId, address[] observers);
    event AddedCollaborator(bytes32 indexed projectId, bytes32 indexed packageId, address collaborator, uint256 mgp);
    event ApprovedCollaborator(bytes32 indexed projectId, bytes32 indexed packageId, address collaborator);
    event RemovedCollaborator(bytes32 indexed projectId_, bytes32 indexed packageId_, address collaborator_);
    event FinishedPackage(bytes32 indexed projectId, bytes32 indexed packageId, uint256 indexed budgetLeft);
    event CanceledPackage(bytes32 indexed projectId, bytes32 indexed packageId, uint256 indexed revertedBudget);
    event PaidObserverFee(bytes32 indexed projectId, bytes32 indexed packageId, address collaborator, uint256 amount);
    event PaidCollaboratorRewards(bytes32 indexed projectId, bytes32 indexed packageId, address collaborator, uint256 mgp, uint256 bonus);

    /**
     * @notice Update treasury address
     * @param treasury_ Treasury address
     * Emit {UpdatedTreasury}
     */
    function updateTreasury(address treasury_) external;

    /**
     * @dev Creates project proposal
     * @param token_ project token address, zero addres if project has not token yet
     * (IOUToken will be deployed on project approval)
     * @param budget_ total budget (has to be approved on token contract if project has its own token)
     *
     * @dev (`token_` == ZERO_ADDRESS) ? project has no token yet : `IOUToken` will be deployed on project approval
     * Emit {CreatedProject}
     */
    function createProject(address token_, uint256 budget_) external;

    /**
     * @notice Finishes project
     * @param _projectId Id of the project
     * Emit {FinishedProject}
     */
    function finishProject(bytes32 _projectId) external;

    /**
     * @notice Creates package in project
     * @param _projectId Id of the project
     * @param _budget MGP budget
     * @param _bonus Bonus budget
     * @param _observerBudget Observer budget
     * @param _collaboratorsLimit maximum collaborators
     * @param _observers List of observers
     * Emit {CreatedPackage}
     */
    function createPackage(
        bytes32 _projectId,
        uint256 _budget,
        uint256 _bonus,
        uint256 _observerBudget,
        uint256 _collaboratorsLimit,
        address[] memory _observers
    ) external;

    /**
     * @notice Finishes package in project
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborators List of collaborators
     * @param _observers List of observers
     * @param _scores List of bonus scores for collaborators
     * 
     * Emit {FinishedPackage}
     */
    function finishPackage(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _collaborators,
        address[] memory _observers,
        uint256[] memory _scores
    ) external;

    /**
     * @notice Cancel package in project and release project budget
     * @param _projectId Id of the project
     * @param _packageId Id of the project
     * @param _collaborators address of the collaborators
     * @param _observers address of the observers
     * Emit {CanceledPackage}
     */
    function cancelPackage(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _collaborators,
        address[] memory _observers,
        bool _workStarted
    ) external;

    /**
     * @notice Adds collaborator to package
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator collaborators' addresses
     * @param _mgp MGP amount
     * Emit {AddedCollaborator}
     */
    function addCollaborator(bytes32 _projectId, bytes32 _packageId, address _collaborator, uint256 _mgp) external;

    /**
     * @notice Approves collaborator's MGP or deletes collaborator (should be called by admin)
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator collaborator's address
     * Emit {ApprovedCollaborator}
     */
    function approveCollaborator(bytes32 _projectId, bytes32 _packageId, address _collaborator) external;

    /**
     * @notice Approves collaborator's MGP or deletes collaborator (should be called by admin)
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator collaborator's address
     * @param _shouldPayMgp Should pay MGP for the collaborator
     * Emit {RemovedCollaborator}
     */
    function removeCollaborator(bytes32 _projectId, bytes32 _packageId, address _collaborator, bool _shouldPayMgp) external;

    /**
     * @notice Self remove collaborator
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * Emit {RemovedCollaborator}
     */
    function selfRemove(bytes32 _projectId, bytes32 _packageId) external;

    /**
     * @notice Adds observers to package
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _observers observers' addresses
     * Emit {AddedObservers}
     */
    function addObservers(bytes32 _projectId, bytes32 _packageId, address[] memory _observers) external;

    /**
     * @notice Removes observers from package
     * @param _projectId Id of the project
     * @param _packageId package id
     * @param _observers observers' addresses
     * Emit {RemovedObservers}
     */
    function removeObservers(bytes32 _projectId, bytes32 _packageId, address[] memory _observers) external;

    /**
     * @notice Adds, removes observers from package
     * @param _projectId Id of the project
     * @param _packageId package id
     * @param _observersIn observers' addresses to be added
     * @param _observersOut observers' addresses to be removed
     * Emit {AddedObservers} {RemovedObservers}
     */
    function updateObservers(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _observersIn,
        address[] memory _observersOut
    ) external;

}
