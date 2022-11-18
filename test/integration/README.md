# Integration Test

This is test flows for integration testing phase.

> All flows will running with contracts deployed in [Before](#before-Deploy-contracts)

## Test flows

Each flow will run sequence by sequence

### Before get in flows testing

1. Prepare users
2. Deploy `TokenFactory` contract -> Verify contract parameters
3. Deploy `RebakedDAO` contract -> Verify contract parameters
4. Link `RebakedDAO` contract with `TokenFactory` contract
5. Setting up `Balance Trackers`
6. Local environments

### 1. Verify contract parameter
1. Verify `TokenFactory` contract parameters
2. Verify `RebakedDAO` contract parameters

### 2. Start project with existed token (Project 1, Package 1)

1. Create **project 1** with existed token
2. Add **package 1**
3. Add **2 collaborators**
4. Approve **2 collaborators**
5. Add **2 observers**
6. Finish **package 1**
7. Set `Bonus Score` to **Collaborator 1**
8. **2 collaborators** claim `MGP`
9. **2 observers** claim `observer fee`
10. **2 Collaborators** try to claim `MGP` but revert
11. **Collaborator 1** claim `Bonus Score`
12. **2 Observers** try to claim `observer fee` but revert
13. Check balance after flow

### 3. No collaborator, no observer (Project 1, Package 2)

1. Add **package 2**
2. Finish **package 2**
3. Check balance after flow

### 4. Normal removing collaborator (Project 1, Package 3)

1. Add **package 3**
2. Add **3 collaborators**
3. Remove **Collaborator 1** with no `MGP`
4. Remove **Collaborator 2** with `MGP`
5. Approve **Collaborator 3**
6. Finish **package 3**
7. **Collaborator 1 & Collaborator 2** try to claim `MGP` but revert
8. **Collaborator 3** claim `MGP`
9. Check balance after flow

### 5. Self removing (Project 1, Package 4)

1. Add **package 5**
2. Add **2 collaborators**
3. **Collaborator 1** self removing
4. Approve **Collaborator 2**
5. Finish **package 5**
6. **Collaborator 2** claim `MGP` 
7. Set `Bonus Score` to **Collaborator 2**
8. **Collaborator 2** claim `Bonus Score`
9. Check balance after flow

### 6. Finish project (Project 1)

1. Finish **project 1**
2. Check balance after flow

### 7. Start project with no token (Project 2, Package 1)

1. Create **project 2** with no token
2. Approve **project 2**
3. Start **project 2**
4. Add **package 1**
5. Add **2 collaborators**
6. Approve **2 collaborators**
7. Add **2 observers**
8. Finish **package 1**
9. Set `Bonus Score` to **Collaborator 1**
10. **2 collaborators** claim `MGP` 
11. **2 observers** claim `observer fee`
12. **Collaborator 1** claim `Bonus Score`
13. Check balance after flow

### 8. Cancel package (Project 2 package 2)

1. Add **package 2**
2. Add **3 collaborators**
3. Approve **3 collaborators**
3. Add **2 observers**
4. Cancel **package 2**
5. **Collaborator 3** try to claim mgp but revert
6. Check balance after flow

### 9. Finish project (Project 2)

1. Finish **project 1**
2. Check balance after flow