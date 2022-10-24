// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

enum PackageStatus {
    OPEN,
    STARTED
}

struct Project {
    address initiator;
    address token;
    bool isOwnToken;
    uint256 budget;
    uint256 budgetAllocated;
    uint256 budgetPaid;
    uint256 timeCreated;
    uint256 timeApproved;
    uint256 timeStarted;
    uint256 timeFinished;
    uint256 totalPackages;
    uint256 totalFinishedPackages;
}

struct Package {
    uint256 budget;
    uint256 budgetAllocated;
    uint256 budgetPaid;
    uint256 budgetObservers;
    uint256 budgetObserversPaid;
    uint256 bonus;
    uint256 collaboratorsPaidBonus;
    uint256 collaboratorsGetBonus;
    uint256 bonusPaid;
    uint256 timeCreated;
    uint256 timeFinished;
    uint256 totalObservers;
    uint256 totalCollaborators;
    uint256 maxCollaborators;
    uint256 approvedCollaborators;
    bool isActive;
    uint256 timeCanceled;
    PackageStatus status;
}

struct Collaborator {
    uint256 mgp;
    uint256 timeMgpApproved;
    uint256 timeMgpPaid;
    uint256 timeBonusPaid;
    uint256 bonusScore;
    bool isDisputeRaised;
    bool isRemoved;
}

struct Observer {
    uint256 timeCreated;
    uint256 timePaid;
    bool isRemoved;
}
