// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

struct Project {
    address initiator;
    address token;
    uint256 budget;
    uint256 budgetAllocated;
    uint256 budgetPaid;
    uint256 timeCreated;
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
    uint256 bonusPaid;
    uint256 collaboratorsPaidBonus;
    uint256 timeCreated;
    uint256 timeFinished;
    uint256 totalObservers;
    uint256 totalCollaborators;
    uint256 collaboratorsLimit;
    uint256 approvedCollaborators;
    uint256 timeCanceled;
    bool isActive;
}

struct Collaborator {
    uint256 mgp;
    uint256 bonus;
    uint256 timeCreated;
    uint256 timeMgpApproved;
    uint256 timeMgpPaid;
    uint256 timeBonusPaid;
    bool isRemoved;
}

struct Observer {
    uint256 timeCreated;
    uint256 timePaid;
    bool isRemoved;
}
