// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;
import { IReBakedDAO } from "./interfaces/IReBakedDAO.sol";
import { ITokenFactory } from "./interfaces/ITokenFactory.sol";
import { IIOUToken } from "./interfaces/IIOUToken.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IERC20, SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Project, ProjectLibrary } from "./libraries/ProjectLibrary.sol";
import { Package, PackageLibrary } from "./libraries/PackageLibrary.sol";
import { Collaborator, CollaboratorLibrary } from "./libraries/CollaboratorLibrary.sol";
import { Observer, ObserverLibrary } from "./libraries/ObserverLibrary.sol";

contract ReBakedDAO is IReBakedDAO, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ProjectLibrary for Project;
    using PackageLibrary for Package;
    using CollaboratorLibrary for Collaborator;
    using ObserverLibrary for Observer;

    // Percent Precision PPM (parts per million)
    uint256 public constant PCT_PRECISION = 1e6;

    uint256 public constant DEFEND_REMOVAL_DURATION = 2 days;

    uint256 public constant RESOLVE_DISPUTE_DURATION = 3 days;

    // Rebaked DAO wallet
    address public treasury;
    // Token Factory contract address
    address public tokenFactory;

    mapping(bytes32 => Project) private projectData;

    mapping(bytes32 => mapping(bytes32 => Package)) private packageData;

    // projectId => packageId => address collaborator
    mapping(bytes32 => mapping(bytes32 => mapping(address => bool))) private approvedUser;

    // projectId => packageId => address collaborator
    mapping(bytes32 => mapping(bytes32 => mapping(address => Collaborator))) private collaboratorData;

    // projectId => packageId => address observer
    mapping(bytes32 => mapping(bytes32 => mapping(address => Observer))) private observerData;

    constructor(address treasury_, address tokenFactory_) {
        require(treasury_ != address(0), "invalid treasury address");
        require(tokenFactory_ != address(0), "invalid tokenFactory address");
        treasury = treasury_;
        tokenFactory = tokenFactory_;
    }

    /**
     * @dev Throws if amount provided is zero
     */
    modifier nonZero(uint256 amount_) {
        require(amount_ > 0, "Zero amount");
        _;
    }

    /**
     * @dev Throws if called by any account other than the project initiator
     */
    modifier onlyInitiator(bytes32 projectId_) {
        require(projectData[projectId_].initiator == _msgSender(), "caller is not project initiator");
        _;
    }

    /***************************************
					PRIVATE
	****************************************/
    /**
     * @dev Generates unique id hash based on _msgSender() address and previous block hash.
     * @param nonce_ nonce
     * @return Id
     */
    function _generateId(uint256 nonce_) private view returns (bytes32) {
        return keccak256(abi.encodePacked(_msgSender(), blockhash(block.number - 1), nonce_));
    }

    /**
     * @dev Returns a new unique project id.
     * @return projectId_ Id of the project.
     */
    function _generateProjectId() private view returns (bytes32 projectId_) {
        projectId_ = _generateId(0);
        require(projectData[projectId_].timeCreated == 0, "duplicate project id");
    }

    /**
     * @dev Returns a new unique package id.
     * @param projectId_ Id of the project
     * @param nonce_ nonce
     * @return packageId_ Id of the package
     */
    function _generatePackageId(bytes32 projectId_, uint256 nonce_) private view returns (bytes32 packageId_) {
        packageId_ = _generateId(nonce_);
        require(packageData[projectId_][packageId_].timeCreated == 0, "duplicate package id");
    }

    /**
     * @dev Starts project
     * @param projectId_ Id of the project
     */
    function _startProject(bytes32 projectId_) private {
        uint256 _paidAmount = projectData[projectId_].budget;
        projectData[projectId_]._startProject(tokenFactory);
        emit StartedProject(projectId_, _paidAmount);
    }

    /***************************************
					ADMIN
	****************************************/

    function updateTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "invalid treasury address");
        treasury = treasury_;
    }

    function _approveProject(bytes32 projectId_) private {
        projectData[projectId_]._approveProject();
        emit ApprovedProject(projectId_);
    }

    /**
     * @dev Approves project
     * @param projectId_ Id of the project
     */
    function approveProject(bytes32 projectId_) external onlyOwner {
        _approveProject(projectId_);
    }

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
    ) external onlyOwner {
        Package storage package = packageData[projectId_][packageId_];
        require(0 < collaborators_.length && collaborators_.length <= package.totalCollaborators, "invalid collaborators list");
        require(collaborators_.length == scores_.length, "arrays length mismatch");
        uint256 _totalBonusScores;
        for (uint256 i = 0; i < collaborators_.length; i++) {
            collaboratorData[projectId_][packageId_][collaborators_[i]]._setBonusScore(scores_[i]);
            _totalBonusScores += scores_[i];
        }
        require(_totalBonusScores == PCT_PRECISION, "incorrect total bonus scores");
        package._setBonusScores(scores_.length);
        emit SetBonusScores(projectId_, packageId_, collaborators_, scores_);
    }

    function resolveDispute(
        bytes32 _projectId,
        bytes32 _packageId,
        address _collaborator,
        bool _approved
    ) external {
        Observer storage observer = observerData[_projectId][_packageId][_msgSender()];
        require(_msgSender() == owner() || (observer.timeCreated > 0 && !observer.isRemoved), "Caller is not authorized");

        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_collaborator];
        require(block.timestamp <= collaborator.resolveExpiresAt, "resolve period already expired");

        collaborator._resolveDispute(_approved);
        packageData[_projectId][_packageId].disputesCount--;
        if (_approved) {
            _payMgp(_projectId, _packageId, _collaborator);
        }
    }

    /***************************************
			PROJECT INITIATOR ACTIONS
	****************************************/

    /**
     * @dev Creates project proposal
     * @param token_ project token address, zero addres if project has not token yet
     * (IOUToken will be deployed on project approval)
     * @param budget_ total budget (has to be approved on token contract if project has its own token)
     */
    function createProject(address token_, uint256 budget_) external nonZero(budget_) {
        bytes32 projectId_ = _generateProjectId();
        projectData[projectId_]._createProject(token_, budget_);
        emit CreatedProject(projectId_, _msgSender(), token_, budget_);
        if (token_ != address(0)) {
            _approveProject(projectId_);
            _startProject(projectId_);
        }
    }

    /**
     * @dev Starts project
     * @param projectId_ Id of the project
     */
    function startProject(bytes32 projectId_) external onlyInitiator(projectId_) {
        _startProject(projectId_);
    }

    /**
     * @dev Creates package in project
     * @param projectId_ Id of the project
     * @param budget_ MGP budget
     * @param bonus_ Bonus budget
     * @param observerBudget_ Observer budget
     * @param maxCollaborators_ maximum collaborators
     */
    function createPackage(
        bytes32 projectId_,
        uint256 budget_,
        uint256 bonus_,
        uint256 observerBudget_,
        uint256 maxCollaborators_
    ) external onlyInitiator(projectId_) nonZero(budget_) {
        Project storage project = projectData[projectId_];
        address _token = project.token;
        uint256 total = budget_ + bonus_ + observerBudget_;
        project._reservePackagesBudget(total, 1);
        bytes32 packageId_ = _generatePackageId(projectId_, 0);
        Package storage package = packageData[projectId_][packageId_];
        package._createPackage(budget_, observerBudget_, bonus_, maxCollaborators_);
        if (project.isOwnToken) {
            IERC20(_token).safeTransferFrom(_msgSender(), treasury, (total * 5) / 100);
        }
        emit CreatedPackage(projectId_, packageId_, budget_, bonus_);
    }

    function cancelPackage(
        bytes32 projectId_,
        bytes32 packageId_,
        address[] memory collaborators_,
        address[] memory observers_
    ) external onlyInitiator(projectId_) {
        Package storage package = packageData[projectId_][packageId_];
        package._cancelPackage();
        require(collaborators_.length == package.totalCollaborators, "invalid collaborators length");
        require(observers_.length == package.totalObservers, "invalid observers length");
        for (uint256 i = 0; i < collaborators_.length; i++) {
            payMgp(projectId_, packageId_, collaborators_[i]);
        }
        for (uint256 i = 0; i < observers_.length; i++) {
            payObserverFee(projectId_, packageId_, observers_[i]);
        }
        uint256 budgetToBeReverted_;
        budgetToBeReverted_ = package.budget - package.budgetPaid;
        projectData[projectId_]._revertPackageBudget(budgetToBeReverted_);
    }

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
    ) external onlyInitiator(projectId_) nonZero(mgp_) {
        require(collaborator_ != address(0), "collaborator's address is zero");
        collaboratorData[projectId_][packageId_][collaborator_]._addCollaborator(mgp_);
        packageData[projectId_][packageId_]._reserveCollaboratorsBudget(mgp_);
        emit AddedCollaborator(projectId_, packageId_, collaborator_, mgp_);
    }

    /**
     * @dev Approves collaborator's MGP or deletes collaborator (should be called by admin)
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
    ) external onlyInitiator(projectId_) {
        Collaborator storage collaborator = collaboratorData[projectId_][packageId_][collaborator_];
        collaborator._approveCollaborator();

        approvedUser[projectId_][packageId_][collaborator_] = true;
        packageData[projectId_][packageId_]._approveCollaborator(true, collaborator.mgp);

        emit ApprovedCollaborator(projectId_, packageId_, collaborator_);
    }

    function removeCollaborator(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        bool willPayMgp_
    ) external onlyInitiator(projectId_) {
        require(!approvedUser[projectId_][packageId_][collaborator_], "collaborator approved already!");

        Collaborator storage collaborator = collaboratorData[projectId_][packageId_][collaborator_];
        if (willPayMgp_) {
            _payMgp(projectId_, packageId_, collaborator_);
            collaborator._removeCollaborator();
        } else {
            collaboratorData[projectId_][packageId_][collaborator_]._requestRemoval(DEFEND_REMOVAL_DURATION);
            packageData[projectId_][packageId_].disputesCount++;
        }
    }

    function settleExpiredDispute(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_,
        bool approved_
    ) external onlyInitiator(projectId_) {
        Collaborator storage collaborator = collaboratorData[projectId_][packageId_][collaborator_];
        require(collaborator._canSettleExpiredDispute(), "not elligible to remove yet");

        collaborator._resolveDispute(approved_);
        packageData[projectId_][packageId_].disputesCount--;
    }

    function selfRemove(bytes32 projectId_, bytes32 packageId_) external {
        Collaborator storage collaborator = collaboratorData[projectId_][packageId_][_msgSender()];
        uint256 mgp_ = collaborator.mgp;
        collaborator._approveCollaborator(false);
        packageData[projectId_][packageId_]._removeCollaborator(mgp_, approvedUser[projectId_][packageId_][_msgSender()]);
        approvedUser[projectId_][packageId_][_msgSender()] = false;
    }

    /**
     * @dev Adds observer to packages
     * @param projectId_ Id of the project
     * @param packageIds_ Id of the package
     * @param observer_ observer address
     */
    function addObserver(
        bytes32 projectId_,
        bytes32[] memory packageIds_,
        address observer_
    ) external onlyInitiator(projectId_) {
        for (uint256 i = 0; i < packageIds_.length; i++) {
            require(observer_ != address(0), "observer's address is zero");
            observerData[projectId_][packageIds_[i]][observer_]._addObserver();
            packageData[projectId_][packageIds_[i]]._addObserver();
        }
        emit AddedObserver(projectId_, packageIds_, observer_);
    }

    /**
     * @dev Removes observer from packages
     * @param projectId_ Id of the project
     * @param packageIds_ packages' ids
     * @param observer_ observer address
     */
    function removeObserver(
        bytes32 projectId_,
        bytes32[] memory packageIds_,
        address observer_
    ) external onlyInitiator(projectId_) {
        for (uint256 i = 0; i < packageIds_.length; i++) {
            Observer storage observer = observerData[projectId_][packageIds_[i]][observer_];
            observer._removeObserver();
            Package storage package = packageData[projectId_][packageIds_[i]];
            package._removeObserver();
        }
    }

    function payMgp(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) public onlyInitiator(projectId_) {
        _payMgp(projectId_, packageId_, collaborator_);
    }

    function _payMgp(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) private {
        uint256 amount_ = collaboratorData[projectId_][packageId_][collaborator_]._payMgp();
        packageData[projectId_][packageId_]._payMgp(amount_);
        projectData[projectId_]._pay(collaborator_, amount_);
        emit PaidMgp(projectId_, packageId_, collaborator_, amount_);
    }

    function payObserverFee(
        bytes32 projectId_,
        bytes32 packageId_,
        address observer_
    ) public onlyInitiator(projectId_) {
        observerData[projectId_][packageId_][observer_]._claimObserverFee();

        uint256 amount_ = packageData[projectId_][packageId_]._getObserverFee();
        packageData[projectId_][packageId_]._claimObserverFee(amount_);
        projectData[projectId_]._pay(observer_, amount_);

        emit PaidObserverFee(projectId_, packageId_, observer_, amount_);
    }

    /**
     * @dev Finishes package in project
     * @param projectId_ Id of the project
     */
    function finishPackage(bytes32 projectId_, bytes32 packageId_) external onlyInitiator(projectId_) {
        uint256 budgetLeft_ = packageData[projectId_][packageId_]._finishPackage();
        projectData[projectId_]._finishPackage(budgetLeft_);
        emit FinishedPackage(projectId_, packageId_, budgetLeft_);
    }

    /**
     * @dev Finishes project
     * @param projectId_ Id of the project
     */
    function finishProject(bytes32 projectId_) external onlyInitiator(projectId_) {
        projectData[projectId_]._finishProject(treasury);
        emit FinishedProject(projectId_);
    }

    /***************************************
			COLLABORATOR ACTIONS
	****************************************/
    /**
     * @dev Sends approved MGP to collaborator, should be called from collaborator's address
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */
    function claimMgp(bytes32 projectId_, bytes32 packageId_) public nonReentrant {
        address collaborator_ = _msgSender();
        Collaborator storage collaborator = collaboratorData[projectId_][packageId_][collaborator_];
        uint256 amount_ = collaborator._claimMgp();
        packageData[projectId_][packageId_]._claimMgp(amount_);
        projectData[projectId_]._pay(collaborator_, amount_);
        emit PaidMgp(projectId_, packageId_, _msgSender(), amount_);
    }

    /**
     * @dev Sends approved Bonus to collaborator, should be called from collaborator's address
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */
    function claimBonus(bytes32 projectId_, bytes32 packageId_) external nonReentrant {
        address collaborator_ = _msgSender();
        Collaborator storage collaborator = collaboratorData[projectId_][packageId_][collaborator_];
        collaborator._claimBonus();
        Package storage package = packageData[projectId_][packageId_];
        (, uint256 amount_) = getCollaboratorRewards(projectId_, packageId_, collaborator_);
        package._claimBonus(amount_);
        projectData[projectId_]._pay(collaborator_, amount_);
        emit PaidBonus(projectId_, packageId_, collaborator_, amount_);
    }

    function defendRemoval(bytes32 _projectId, bytes32 _packageId) external {
        Collaborator storage collaborator = collaboratorData[_projectId][_packageId][_msgSender()];
        collaborator._defendRemoval(RESOLVE_DISPUTE_DURATION);
    }

    /***************************************
			OBSERVER ACTIONS
	****************************************/

    /**
     * @dev Sends observer fee, should be called from observer's address
     * @param projectId_ Id of the project
     * @param packageId_ Id of the package
     */
    function claimObserverFee(bytes32 projectId_, bytes32 packageId_) external nonReentrant {
        address observer_ = _msgSender();
        Observer storage observer = observerData[projectId_][packageId_][observer_];
        observer._claimObserverFee();

        uint256 amount_ = packageData[projectId_][packageId_]._getObserverFee();
        packageData[projectId_][packageId_]._claimObserverFee(amount_);
        projectData[projectId_]._pay(observer_, amount_);

        emit PaidObserverFee(projectId_, packageId_, observer_, amount_);
    }

    /***************************************
			GETTERS
	****************************************/

    function getProjectData(bytes32 projectId_) external view returns (Project memory) {
        return projectData[projectId_];
    }

    function getPackageData(bytes32 projectId_, bytes32 packageId_) external view returns (Package memory) {
        return (packageData[projectId_][packageId_]);
    }

    function getCollaboratorData(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) external view returns (Collaborator memory) {
        return collaboratorData[projectId_][packageId_][collaborator_];
    }

    function getCollaboratorRewards(
        bytes32 projectId_,
        bytes32 packageId_,
        address collaborator_
    ) public view returns (uint256, uint256) {
        Package storage package = packageData[projectId_][packageId_];
        Collaborator storage collaborator = collaboratorData[projectId_][packageId_][collaborator_];

        uint256 mgpClaimable = (collaborator.timeMgpPaid == 0) ? collaborator.mgp : 0;
        uint256 bonusClaimable;
        if (collaborator.bonusScore > 0 && collaborator.timeBonusPaid == 0) {
            bonusClaimable = (package.collaboratorsPaidBonus + 1 == package.collaboratorsGetBonus)
                ? (package.bonus - package.bonusPaid)
                : (collaborator.bonusScore * package.bonus) / PCT_PRECISION;
        }

        return (mgpClaimable, bonusClaimable);
    }

    function getObserverData(
        bytes32 projectId_,
        bytes32 packageId_,
        address observer_
    ) external view returns (Observer memory) {
        return observerData[projectId_][packageId_][observer_];
    }

    function getObserverFee(
        bytes32 projectId_,
        bytes32 packageId_,
        address observer_
    ) public view returns (uint256) {
        Observer storage observer = observerData[projectId_][packageId_][observer_];
        if (observer.timePaid > 0 || observer.timeCreated == 0 || observer.isRemoved) {
            return 0;
        }
        return packageData[projectId_][packageId_]._getObserverFee();
    }
}
