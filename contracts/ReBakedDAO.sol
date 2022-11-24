// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { IReBakedDAO } from "./interfaces/IReBakedDAO.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable, SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { Project, ProjectLibrary } from "./libraries/ProjectLibrary.sol";
import { Package, PackageLibrary } from "./libraries/PackageLibrary.sol";
import { Collaborator, CollaboratorLibrary } from "./libraries/CollaboratorLibrary.sol";
import { Observer, ObserverLibrary } from "./libraries/ObserverLibrary.sol";

/**
 *  @title  ReBakedDAO Contract
 *  @author ReBaked Team
 */
contract ReBakedDAO is IReBakedDAO, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ProjectLibrary for Project;
    using PackageLibrary for Package;
    using CollaboratorLibrary for Collaborator;
    using ObserverLibrary for Observer;

    // Percent Precision PPM (parts per million)
    uint256 public constant PCT_PRECISION = 1e6;

    // Rebaked DAO wallet
    address public treasury;

    // projectId => Project
    mapping(bytes32 => Project) private projectData;

    // projectId => packageId => Package
    mapping(bytes32 => mapping(bytes32 => Package)) private packageData;

    // projectId => packageId => address collaborator
    mapping(bytes32 => mapping(bytes32 => mapping(address => bool))) private approvedUser;

    // projectId => packageId => address collaborator
    mapping(bytes32 => mapping(bytes32 => mapping(address => Collaborator))) private collaboratorData;

    // projectId => packageId => address observer
    mapping(bytes32 => mapping(bytes32 => mapping(address => Observer))) private observerData;

    /**
     * @notice Throws if amount provided is zero
     */
    modifier nonZero(uint256 amount_) {
        require(amount_ > 0, "Zero amount");
        _;
    }

    /**
     * @notice Throws if called by any account other than the project initiator
     */
    modifier onlyInitiator(bytes32 _projectId) {
        require(projectData[_projectId].initiator == _msgSender(), "caller is not project initiator");
        _;
    }

    /**
     * @notice Initialize of contract (replace for constructor)
     * @param treasury_ Treasury address
     */
    function initialize(address treasury_) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        require(treasury_ != address(0), "invalid treasury address");

        treasury = treasury_;
    }

    /* --------EXTERNAL FUNCTIONS-------- */

    /**
     * @notice Update treasury address
     * @param treasury_ Treasury address
     * Emit {UpdatedTreasury}
     */
    function updateTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "invalid treasury address");
        address oldTreasury = treasury;
        treasury = treasury_;

        emit UpdatedTreasury(oldTreasury, treasury);
    }

    /**
     * @dev Creates project proposal
     * @param token_ project token address, zero addres if project has not token yet
     * (IOUToken will be deployed on project approval)
     * @param budget_ total budget (has to be approved on token contract if project has its own token)
     *
     * @dev (`token_` == ZERO_ADDRESS) ? project has no token yet : `IOUToken` will be deployed on project approval
     * Emit {CreatedProject}
     */
    function createProject(address token_, uint256 budget_) external nonZero(budget_) nonReentrant {
        require(token_ != address(0), "Invalid token address");
        bytes32 _projectId = _generateProjectId();
        projectData[_projectId]._createProject(token_, budget_);
        emit CreatedProject(_projectId, _msgSender(), token_, budget_);
    }

    /**
     * @notice Finishes project
     * @param _projectId Id of the project
     * Emit {FinishedProject}
     */
    function finishProject(bytes32 _projectId) external onlyInitiator(_projectId) {
        projectData[_projectId]._finishProject();
        emit FinishedProject(_projectId);
    }

    /**
     * @notice Sets scores for collaborator bonuses
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborators array of collaborators' addresses
     * @param _scores array of collaboratos' scores in PPM
     * Emit {SetBonusScores}
     */
    function setBonusScores(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _collaborators,
        uint256[] memory _scores
    ) external onlyOwner {
        Package storage package = packageData[_projectId][_packageId];
        require(0 < _collaborators.length && _collaborators.length <= package.totalCollaborators, "invalid collaborators list");
        require(_collaborators.length == _scores.length, "arrays length mismatch");

        uint256 _totalBonusScores;
        for (uint256 i = 0; i < _collaborators.length; i++) {
            collaboratorData[_projectId][_packageId][_collaborators[i]]._setBonusScore(_scores[i]);
            _totalBonusScores += _scores[i];
        }

        require(_totalBonusScores == PCT_PRECISION, "incorrect total bonus scores");
        package._setBonusScores(_scores.length);

        emit SetBonusScores(_projectId, _packageId, _collaborators, _scores);
    }

    /**
     * @notice Creates package in project
     * @param _projectId Id of the project
     * @param _budget MGP budget
     * @param _bonus Bonus budget
     * @param _observerBudget Observer budget
     * @param _maxCollaborators maximum collaborators
     * Emit {CreatedPackage}
     */
    function createPackage(
        bytes32 _projectId,
        uint256 _budget,
        uint256 _bonus,
        uint256 _observerBudget,
        uint256 _maxCollaborators
    ) external onlyInitiator(_projectId) nonZero(_budget) nonReentrant {
        Project storage project = projectData[_projectId];
        uint256 total = _budget + _bonus + _observerBudget;
        project._reservePackagesBudget(total, 1);
        bytes32 _packageId = _generatePackageId(_projectId, 0);
        Package storage package = packageData[_projectId][_packageId];
        package._createPackage(_budget, _observerBudget, _bonus, _maxCollaborators);
        IERC20Upgradeable(project.token).safeTransferFrom(_msgSender(), treasury, (total * 5) / 100);

        emit CreatedPackage(_projectId, _packageId, _budget, _bonus);
    }

    /**
     * @notice Finishes package in project
     * @param _projectId Id of the project
     * Emit {FinishedPackage}
     */
    function finishPackage(bytes32 _projectId, bytes32 _packageId) external onlyInitiator(_projectId) {
        uint256 budgetLeft_ = packageData[_projectId][_packageId]._finishPackage();
        projectData[_projectId]._finishPackage(budgetLeft_);
        emit FinishedPackage(_projectId, _packageId, budgetLeft_);
    }

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
        address[] memory _observers
    ) external onlyInitiator(_projectId) {
        Package storage package = packageData[_projectId][_packageId];
        require(_collaborators.length == package.totalCollaborators, "invalid collaborators length");
        require(_observers.length == package.totalObservers, "invalid observers length");

        package._cancelPackage();

        for (uint256 i = 0; i < _collaborators.length; i++) _payMgp(_projectId, _packageId, _collaborators[i]);

        for (uint256 i = 0; i < _observers.length; i++) _payObserverFee(_projectId, _packageId, _observers[i]);

        uint256 budgetToBeReverted_ = (package.budget - package.budgetPaid) + package.bonus;
        if (package.totalObservers == 0) budgetToBeReverted_ += package.budgetObservers;
        projectData[_projectId]._revertPackageBudget(budgetToBeReverted_);

        emit CanceledPackage(_projectId, _packageId, budgetToBeReverted_);
    }

    /**
     * @notice Adds collaborator to package
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator collaborators' addresses
     * @param _mgp MGP amount
     * Emit {AddedCollaborator}
     */
    function addCollaborator(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator,
        uint256 _mgp
    ) external onlyInitiator(_projectId) nonZero(_mgp) {
        require(_collaborator != address(0), "collaborator's address is zero");

        collaboratorData[_projectId][_packageId][_collaborator]._addCollaborator(_mgp);
        packageData[_projectId][_packageId]._allocateBudget(_mgp);

        emit AddedCollaborator(_projectId, _packageId, _collaborator, _mgp);
    }

    /**
     * @notice Approves collaborator's MGP or deletes collaborator (should be called by admin)
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator collaborator's address
     * Emit {ApprovedCollaborator}
     */
    function approveCollaborator(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator
    ) external onlyInitiator(_projectId) {
        approvedUser[_projectId][_packageId][_collaborator] = true;

        collaboratorData[_projectId][_packageId][_collaborator]._approveCollaborator();
        packageData[_projectId][_packageId]._approveCollaborator();

        emit ApprovedCollaborator(_projectId, _packageId, _collaborator);
    }

    /**
     * @notice Approves collaborator's MGP or deletes collaborator (should be called by admin)
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator collaborator's address
     * @param _shouldPayMgp Should pay MGP for the collaborator
     * Emit {RemovedCollaborator}
     */
    function removeCollaborator(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator,
        bool _shouldPayMgp
    ) external onlyInitiator(_projectId) {
        require(!approvedUser[_projectId][_packageId][_collaborator], "collaborator approved already!");

        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_collaborator];
        if (_shouldPayMgp) {
            _payMgp(_projectId, _packageId, _collaborator);
        }

        packageData[_projectId][_packageId]._removeCollaborator(collaborator.mgp);
        collaborator._removeCollaborator();

        emit RemovedCollaborator(_projectId, _packageId, _collaborator);
    }

    /**
     * @notice Self remove collaborator
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * Emit {RemovedCollaborator}
     */
    function selfRemove(bytes32 _projectId, bytes32 _packageId) external {
        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_msgSender()];
        require(!approvedUser[_projectId][_packageId][_msgSender()], "collaborator approved already!");

        collaborator._removeCollaborator();
        packageData[_projectId][_packageId]._removeCollaborator(collaborator.mgp);

        emit RemovedCollaborator(_projectId, _packageId, _msgSender());
    }

    /**
     * @notice Adds observer to packages
     * @param _projectId Id of the project
     * @param _packageIds Id of the package
     * @param _observer observer address
     * Emit {AddedObserver}
     */
    function addObserver(
        bytes32 _projectId,
        bytes32[] memory _packageIds,
        address _observer
    ) external onlyInitiator(_projectId) {
        for (uint256 i = 0; i < _packageIds.length; i++) {
            require(_observer != address(0), "observer's address is zero");
            observerData[_projectId][_packageIds[i]][_observer]._addObserver();
            packageData[_projectId][_packageIds[i]]._addObserver();
        }

        emit AddedObserver(_projectId, _packageIds, _observer);
    }

    /**
     * @notice Removes observer from packages
     * @param _projectId Id of the project
     * @param _packageIds packages' ids
     * @param _observer observer address
     * Emit {RemovedObserver}
     */
    function removeObserver(
        bytes32 _projectId,
        bytes32[] memory _packageIds,
        address _observer
    ) external onlyInitiator(_projectId) {
        for (uint256 i = 0; i < _packageIds.length; i++) {
            observerData[_projectId][_packageIds[i]][_observer]._removeObserver();
            packageData[_projectId][_packageIds[i]]._removeObserver();
        }

        emit RemovedObserver(_projectId, _packageIds, _observer);
    }

    /**
     * @notice Pay fee to observer
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _observer observer address
     * Emit {PaidObserverFee}
     */
    function _payObserverFee(
        bytes32 _projectId,
        bytes32 _packageId,
        address _observer
    ) private {
        observerData[_projectId][_packageId][_observer]._claimObserverFee();

        uint256 amount_ = packageData[_projectId][_packageId]._getObserverFee();
        packageData[_projectId][_packageId]._claimObserverFee(amount_);
        projectData[_projectId]._pay(_observer, amount_);

        emit PaidObserverFee(_projectId, _packageId, _observer, amount_);
    }

    /**
     * @notice Sends approved MGP to collaborator, should be called from collaborator's address
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * Emit {PaidMgp}
     */
    function claimMgp(bytes32 _projectId, bytes32 _packageId) public nonReentrant {
        address _collaborator = _msgSender();
        uint256 amount_ = collaboratorData[_projectId][_packageId][_collaborator]._claimMgp();

        packageData[_projectId][_packageId]._claimMgp(amount_);
        projectData[_projectId]._pay(_collaborator, amount_);
        emit PaidMgp(_projectId, _packageId, _msgSender(), amount_);
    }

    /**
     * @notice Sends approved Bonus to collaborator, should be called from collaborator's address
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * Emit {PaidBonus}
     */
    function claimBonus(bytes32 _projectId, bytes32 _packageId) external nonReentrant {
        address _collaborator = _msgSender();

        (, uint256 amount_) = getCollaboratorRewards(_projectId, _packageId, _collaborator);

        collaboratorData[_projectId][_packageId][_collaborator]._claimBonus();
        packageData[_projectId][_packageId]._claimBonus(amount_);
        projectData[_projectId]._pay(_collaborator, amount_);

        emit PaidBonus(_projectId, _packageId, _collaborator, amount_);
    }

    /**
     * @notice Sends observer fee, should be called from observer's address
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * Emit {PaidObserverFee}
     */
    function claimObserverFee(bytes32 _projectId, bytes32 _packageId) external nonReentrant {
        address _observer = _msgSender();

        observerData[_projectId][_packageId][_observer]._claimObserverFee();

        uint256 amount_ = packageData[_projectId][_packageId]._getObserverFee();
        packageData[_projectId][_packageId]._claimObserverFee(amount_);
        projectData[_projectId]._pay(_observer, amount_);

        emit PaidObserverFee(_projectId, _packageId, _observer, amount_);
    }

    /* --------VIEW FUNCTIONS-------- */

    /**
     * @notice Get project details
     * @param _projectId Id of the project
     */
    function getProjectData(bytes32 _projectId) external view returns (Project memory) {
        return projectData[_projectId];
    }

    /**
     * @notice Get package details
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     */
    function getPackageData(bytes32 _projectId, bytes32 _packageId) external view returns (Package memory) {
        return (packageData[_projectId][_packageId]);
    }

    /**
     * @notice Get collaborator details
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator Collaborator address
     */
    function getCollaboratorData(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator
    ) external view returns (Collaborator memory) {
        return collaboratorData[_projectId][_packageId][_collaborator];
    }

    /**
     * @notice Get collaborator rewards
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator Collaborator address
     */
    function getCollaboratorRewards(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator
    ) public view returns (uint256, uint256) {
        Package storage package = packageData[_projectId][_packageId];
        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_collaborator];

        uint256 mgpClaimable = (collaborator.timeMgpPaid == 0) ? collaborator.mgp : 0;
        uint256 bonusClaimable = 0;
        if (collaborator.bonusScore > 0 && collaborator.timeBonusPaid == 0) {
            bonusClaimable = (package.collaboratorsPaidBonus + 1 == package.collaboratorsGetBonus)
                ? (package.bonus - package.bonusPaid)
                : (collaborator.bonusScore * package.bonus) / PCT_PRECISION;
        }
        return (mgpClaimable, bonusClaimable);
    }

    /**
     * @notice Get observer details
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _observer Observer address
     */
    function getObserverData(
        bytes32 _projectId,
        bytes32 _packageId,
        address _observer
    ) external view returns (Observer memory) {
        return observerData[_projectId][_packageId][_observer];
    }

    /**
     * @notice Get observer fee
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _observer Observer address
     */
    function getObserverFee(
        bytes32 _projectId,
        bytes32 _packageId,
        address _observer
    ) public view returns (uint256) {
        Observer storage observer = observerData[_projectId][_packageId][_observer];
        if (observer.timePaid > 0 || observer.timeCreated == 0 || observer.isRemoved) {
            return 0;
        }
        return packageData[_projectId][_packageId]._getObserverFee();
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
     * @notice Returns a new unique project id.
     * @return _projectId Id of the project.
     */
    function _generateProjectId() private view returns (bytes32 _projectId) {
        _projectId = _generateId(0);
        require(projectData[_projectId].timeCreated == 0, "duplicate project id");
    }

    /**
     * @notice Returns a new unique package id.
     * @param _projectId Id of the project
     * @param _nonce nonce
     * @return _packageId Id of the package
     */
    function _generatePackageId(bytes32 _projectId, uint256 _nonce) private view returns (bytes32 _packageId) {
        _packageId = _generateId(_nonce);
        require(packageData[_projectId][_packageId].timeCreated == 0, "duplicate package id");
    }

    /**
     * @notice Pay MGP to collaborator
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator collaborator address
     * Emit {PaidMgp}
     */
    function _payMgp(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator
    ) private {
        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_collaborator];

        collaborator._payMgp();
        packageData[_projectId][_packageId]._payMgp(collaborator.mgp);
        projectData[_projectId]._pay(_collaborator, collaborator.mgp);

        emit PaidMgp(_projectId, _packageId, _collaborator, collaborator.mgp);
    }
}
