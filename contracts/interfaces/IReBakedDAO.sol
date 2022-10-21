// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IReBakedDAO {
    event ChangedFees(uint256 feeDao, uint256 feeObservers);
    event CreatedProject(
        bytes32 indexed projectId,
        address initiator,
        address token,
        uint256 budget
    );
    event ApprovedProject(bytes32 indexed projectId);
    event ApprovedProjects(bytes32[] projectIds);
    event StartedProject(bytes32 indexed projectId);
    event FinishedProject(bytes32 indexed projectId);
    event CreatedPackage(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        uint256 budget,
        uint256 bonus
    );
    event CreatedPackages(
        bytes32 indexed projectId,
        bytes32[] packageIds,
        uint256[] budgets,
        uint256[] bonuses
    );
    event AddedObserver(
        bytes32 indexed projectId,
        bytes32[] indexed packageId,
        address observer
    );
    event AddedObservers(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address[] observers
    );
    event AddedCollaborator(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address collaborator,
        uint256 mgp
    );
    event AddedCollaborators(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address[] collaborators,
        uint256[] mgps
    );
    event ApprovedCollaborator(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address collaborator,
        bool approve
    );
    event ApprovedCollaborators(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address[] collaborators,
        bool[] approves
    );
    event FinishedPackage(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        uint256 indexed budgetLeft_
    );
    event SetBonusScores(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address[] collaborators,
        uint256[] scores
    );
    event PaidDao(bytes32 indexed projectId, uint256 amount);
    event PaidMgp(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address collaborator,
        uint256 amount
    );
    event PaidMgps(
        bytes32 indexed projectId,
        bytes32[] packageIds,
        address collaborator,
        uint256 amount
    );
    event PaidBonus(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address collaborator,
        uint256 amount
    );
    event PaidBonuses(
        bytes32 indexed projectId,
        bytes32[] packageIds,
        address collaborator,
        uint256 amount
    );
    event PaidObserverFee(
        bytes32 indexed projectId,
        bytes32 indexed packageId,
        address observer,
        uint256 amount
    );
    event PaidObserverFees(
        bytes32 indexed projectId,
        bytes32[] packageIds,
        address observer,
        uint256 amount
    );

    /***************************************
					ADMIN
	****************************************/

    /**
     * @dev Sets new fees
     * @param feeDao_ DAO fee in ppm
     * @param feeObservers_ Observers fee in ppm
     */
    function changeFees(uint256 feeDao_, uint256 feeObservers_) external;

    /**
     * @dev Approves project
     * @param projectId_ Id of the project
     */
    function approveProject(bytes32 projectId_) external;

    /**
     * @dev Sets scores for collaborator bonuses
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param collaborators_ array of collaborators' addresses
     * @param scores_ array of collaboratos' scores in PPM
     */
    function setBonusScores(
        bytes32 projectId_,
        bytes32 packageId_,
        address[] memory collaborators_,
        uint256[] memory scores_
    ) external;

    /***************************************
			PROJECT INITIATOR ACTIONS
	****************************************/

    /**
     * @dev Creates project proposal
     * @param token_ project token address, zero addres if project has not token yet
     * (IOUT will be deployed on project approval)
     * @param budget_ total budget (has to be approved on token contract if project has its own token)
     * @return projectId_ Id of the project proposal created
     */
    function createProject(address token_, uint256 budget_)
        external
        returns (bytes32 projectId_);

    /**
     * @dev Starts project
     * @param projectId_ Id of the project
     */
    function startProject(bytes32 projectId_) external;

    /**
     * @dev Creates package in project
     * @param projectId_ Id of the project
     * @param budget_ MGP budget
     * @param bonus_ Bonus budget
     * @return packageId_ Id of the package created
     */
    function createPackage(
        bytes32 projectId_,
        uint256 budget_,
        uint256 bonus_,
        uint256 observerBudget_
    ) external returns (bytes32 packageId_);

    /**
     * @dev Approves collaborator's MGP or deletes collaborator
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param collaborator_ collaborator's address
     * @param approve_ - bool whether to approve or not collaborator payment
     */
    function approveCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        bool approve_
    ) external;

    function cancelPackage(
        bytes32 projectId_,
        bytes32 packageId_,
        address[] calldata collaborator_,
        address[] calldata observer_
    ) external;

    /**
     * @dev Adds observer to package
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param observer_ observer addresses
     */
    function addObserver(
        bytes32 projectId_,
        bytes32[] calldata packageId_,
        address observer_
    ) external;

    /**
     * @dev Adds collaborator to package
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @param collaborator_ collaborators' addresses
     * @param mgp_ MGP amount
     */
    function addCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        uint256 mgp_
    ) external;

    function removeCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        bool packageStatus
    ) external;

    function removeObserver(
        bytes32 projectId_,
        bytes32[] calldata packageId_,
        address observer_
    ) external;

    /**
     * @dev Finishes package in project
     * @param projectId_ Id of the project
     */
    function finishPackage(bytes32 projectId_, bytes32 packageId_)
        external
        returns (uint256 budgetLeft_);

    /**
     * @dev Finishes project
     * @param projectId_ Id of the project
     */
    function finishProject(bytes32 projectId_) external;

    /***************************************
			COLLABORATOR ACTIONS
	****************************************/
    /**
     * @dev Sends approved MGP to collaborator, should be called from collaborator's address
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @return amount_ mgp amount paid
     */
    function getMgp(
        bytes32 projectId_,
        bytes32 packageId_
    ) external returns (uint256 amount_);

    /**
     * @dev Sends approved Bonus to collaborator, should be called from collaborator's address
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @return amount_ bonus amount paid
     */
    function getBonus(
        bytes32 projectId_,
        bytes32 packageId_
    ) external returns (uint256 amount_);

    /***************************************
			OBSERVER ACTIONS
	****************************************/

    /**
     * @dev Sends observer fee, should be called from observer's address
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     * @return amount_ fee amount paid
     */
    function getObserverFee(bytes32 projectId_, bytes32 packageId_)
        external
        returns (uint256 amount_);
}
