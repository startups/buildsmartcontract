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
     * @param token_ project token address
     * @param budget_ total budget (has to be approved on token contract if project has its own token)
     *
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
    function finishProject(bytes32 _projectId) external onlyInitiator(_projectId) nonReentrant {
        uint256 budgetLeft_ = projectData[_projectId]._finishProject();
        emit FinishedProject(_projectId, budgetLeft_);
    }

    /**
     * @notice Creates package in project
     * @param _projectId Id of the project
     * @param _budget MGP budget
     * @param _bonus Bonus budget
     * @param _observerBudget Observer budget
     * @param _collaboratorsLimit limit on number of collaborators
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
    ) external onlyInitiator(_projectId) nonZero(_budget) nonReentrant {
        Project storage project = projectData[_projectId];
        uint256 total = _budget + _bonus + _observerBudget;
        project._reservePackagesBudget(total);
        bytes32 _packageId = _generatePackageId(_projectId, 0);
        Package storage package = packageData[_projectId][_packageId];
        package._createPackage(_budget, _observerBudget, _bonus, _collaboratorsLimit);
        IERC20Upgradeable(project.token).safeTransferFrom(_msgSender(), treasury, (total * 5) / 100);

        if (_observers.length > 0) {
            require(_observerBudget > 0, "invalid observers budget");
            _addObservers(_projectId, _packageId, _observers);
        }

        emit CreatedPackage(_projectId, _packageId, _budget, _bonus, _observerBudget);
    }

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
    ) external onlyInitiator(_projectId) {
        Package storage package = packageData[_projectId][_packageId];
        require(_collaborators.length == package.totalCollaborators, "invalid collaborators list");
        require(_collaborators.length == _scores.length, "arrays' length mismatch");
        require(_observers.length == package.totalObservers, "invalid observers list");

        uint256 budgetLeft_ = package._finishPackage();
        projectData[_projectId]._finishPackage(budgetLeft_);

        if (package.bonus > 0 && _collaborators.length > 0) {
            uint256 _totalBonusScores = 0;
            for (uint256 i = 0; i < _scores.length; i++) {
                require(_scores[i] > 0, "invalid bonus score");
                _totalBonusScores += _scores[i];
            }
            require(_totalBonusScores == PCT_PRECISION, "incorrect total bonus scores");
        }

        for (uint256 i = 0; i < _collaborators.length; i++) {
            _payCollaboratorRewards(_projectId, _packageId, _collaborators[i], _scores[i]);
        }

        for (uint256 i = 0; i < _observers.length; i++) {
            _payObserverFee(_projectId, _packageId, _observers[i]);
        }

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
        address[] memory _observers,
        bool _workStarted
    ) external onlyInitiator(_projectId) {
        Package storage package = packageData[_projectId][_packageId];
        require(_collaborators.length == package.totalCollaborators, "invalid collaborators length");
        require(_observers.length == package.totalObservers, "invalid observers length");

        package._cancelPackage();

        if (_workStarted) {
            for (uint256 i = 0; i < _collaborators.length; i++) _payCollaboratorRewards(_projectId, _packageId, _collaborators[i], 0);
            for (uint256 i = 0; i < _observers.length; i++) _payObserverFee(_projectId, _packageId, _observers[i]);
        }

        uint256 budgetToBeReverted_ = (package.budget - package.budgetPaid) + package.bonus;
        budgetToBeReverted_ += (package.budgetObservers - package.budgetObserversPaid);
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
            _payCollaboratorRewards(_projectId, _packageId, _collaborator, 0);
        }

        collaborator._removeCollaborator();
        packageData[_projectId][_packageId]._removeCollaborator(_shouldPayMgp, collaborator.mgp);

        emit RemovedCollaborator(_projectId, _packageId, _collaborator);
    }

    /**
     * @notice Self remove collaborator
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * Emit {RemovedCollaborator}
     */
    function selfRemove(bytes32 _projectId, bytes32 _packageId) external {
        require(!approvedUser[_projectId][_packageId][_msgSender()], "collaborator approved already!");

        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_msgSender()];
        collaborator._removeCollaborator();
        packageData[_projectId][_packageId]._removeCollaborator(false, collaborator.mgp);

        emit RemovedCollaborator(_projectId, _packageId, _msgSender());
    }

    function _addObservers(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _observers
    ) private {
        require(_observers.length > 0, "empty observers array!");

        for (uint256 i = 0; i < _observers.length; i++) {
            require(_observers[i] != address(0), "zero observer's address!");
            observerData[_projectId][_packageId][_observers[i]]._addObserver();
        }
        packageData[_projectId][_packageId]._addObservers(_observers.length);

        emit AddedObservers(_projectId, _packageId, _observers);
    }

    /**
     * @notice Adds observer to packages
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _observers observers' addresses
     * Emit {AddedObservers}
     */
    function addObservers(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _observers
    ) external onlyInitiator(_projectId) {
        _addObservers(_projectId, _packageId, _observers);
    }

    /**
     * @notice Removes observer from packages
     * @param _projectId Id of the project
     * @param _packageId package id
     * @param _observers observers' addresses
     * Emit {RemovedObservers}
     */
    function removeObservers(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _observers
    ) external onlyInitiator(_projectId) {
        require(_observers.length > 0, "empty observers array!");

        for (uint256 i = 0; i < _observers.length; i++) {
            observerData[_projectId][_packageId][_observers[i]]._removeObserver();
        }
        packageData[_projectId][_packageId]._removeObservers(_observers.length);

        emit RemovedObservers(_projectId, _packageId, _observers);
    }

    function updateObservers(
        bytes32 _projectId,
        bytes32 _packageId,
        address[] memory _observersIn,
        address[] memory _observersOut
    ) external onlyInitiator(_projectId) {
        require(_observersIn.length > 0 || _observersOut.length > 0, "empty observers arrays!");

        if (_observersIn.length > 0) {
            for (uint256 i = 0; i < _observersIn.length; i++) {
                observerData[_projectId][_packageId][_observersIn[i]]._addObserver();
            }
            packageData[_projectId][_packageId]._addObservers(_observersIn.length);

            emit AddedObservers(_projectId, _packageId, _observersIn);
        }

        if (_observersOut.length > 0) {
            for (uint256 i = 0; i < _observersOut.length; i++) {
                observerData[_projectId][_packageId][_observersOut[i]]._removeObserver();
            }

            packageData[_projectId][_packageId]._removeObservers(_observersOut.length);

            emit RemovedObservers(_projectId, _packageId, _observersOut);
        }
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
        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_collaborator];

        return (collaborator.mgp, collaborator.bonus);
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
     * @notice Pay fee to observer
     * @param _projectId Id of the project
     * @param _packageId Id of the package
     * @param _collaborator observer address
     * @param _score Bonus score of collaborator
     * Emit {PaidCollaboratorRewards}
     */
    function _payCollaboratorRewards(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator,
        uint256 _score
    ) private {
        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_collaborator];
        Package storage package = packageData[_projectId][_packageId];

        uint256 bonus_;
        if (package.bonus > 0 && _score > 0) {
            bonus_ = (package.collaboratorsPaidBonus + 1 == package.totalCollaborators)
                    ? (package.bonus - package.bonusPaid)
                    : (package.bonus * _score) / PCT_PRECISION;
        }

        collaboratorData[_projectId][_packageId][_collaborator]._payReward(bonus_);
        packageData[_projectId][_packageId]._payReward(collaborator.mgp, bonus_);
        projectData[_projectId]._pay(_collaborator, collaborator.mgp + bonus_);

        emit PaidCollaboratorRewards(_projectId, _packageId, _collaborator, collaborator.mgp, bonus_);
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
        observerData[_projectId][_packageId][_observer]._payObserverFee();

        uint256 amount_ = packageData[_projectId][_packageId]._getObserverFee();
        packageData[_projectId][_packageId]._payObserverFee(amount_);
        projectData[_projectId]._pay(_observer, amount_);

        emit PaidObserverFee(_projectId, _packageId, _observer, amount_);
    }

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
}
