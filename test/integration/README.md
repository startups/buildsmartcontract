# Integration Test

This is test flows for integration testing phase.

> All flows will running with contracts deployed in [Flow 1](#flow-1-Deploy-contracts)

## Test flows

Each flow will run sequence by sequence

### Before get in flows testing

1. Prepare users
2. Setting up `Balance Trackers`
3. Local environments

### 1. Deploy contracts

1. Deploy `TokenFactory` contract -> Verify contract parameters
2. Deploy `RebakedDAO` contract -> Verify contract parameters
3. Link `RebakedDAO` contract with `TokenFactory` contract

### 2. Start project with existed token (Project 1, Package 1)

1. Create **project 1** with existed token
2. Add **package 1**
3. Add **2 collaborators**
4. Approve **2 collaborators**
5. Add **2 observers**
6. Finish **package 1**
7. Set `Bonus Score` to **Collaborator 1**
8. Pay `MGP` to **2 collaborators**
9. Pay `MGP` fee to **2 observers**
10. **2 Collaborators** claim `MGP`
11. **Collaborator 1** claim `Bonus Score`
12. **2 Observers** claim `MGP` fee
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
5. **Collaborator 2** claim `MGP`
6. Approve **Collaborator 3**
7. Finish **package 3**
8. Pay `MGP` to **Collaborator 2**
9. **Collaborator 3** claim `MGP`
10. Check balance after flow

### 5. Defend removal (Project 1, Package 4)

1. Add **package 4**
2. Add **3 collaborators**
3. Remove **Collaborator 1** with no `MGP`
4. **Collaborator 1** defend removal
5. Resolve dispute **Collaborator 1** with no `MGP`
6. Remove **Collaborator 2** with no `MGP`
7. Resolve dispute **Collaborator 2** with `MGP`
8. **Collaborator 2** claim `MGP`
9. Approve **Collaborator 3**
10. Finish **package 4**
11. Pay `MGP` to **Collaborator 3**
12. **Collaborator 3** claim `MGP`
13. Check balance after flow

### 6. Self removing (Project 1, Package 5)

1. Add **package 5**
2. Add **2 collaborators**
3. **Collaborator 1** self removing
4. Approve **Collaborator 2**
5. Finish **package 5**
6. Pay `MGP` to **Collaborator 2**
7. Set `Bonus Score` to **Collaborator 2**
8. **Collaborator 2** claim `Bonus Score`
9. **Collaborator 2** claim `MGP`
10. Check balance after flow

### 7. Finish project (Project 1)

1. Finish **project 1**
2. Check balance after flow

### 8. Start project with no token (Project 2)

1. Create **project 2** with no token
2. Approve **project 2**
3. Start **project 2**
4. Add **package 1**
5. Add **2 collaborators**
6. Approve **2 collaborators**
7. Add **2 observers**
8. Finish **package 1**
9. Set `Bonus Score` to **Collaborator 1**
10. Pay `MGP` to **2 collaborators**
11. Pay `MGP` fee to **2 observers**
12. **2 Collaborators** claim `MGP`
13. **Collaborator 1** claim `Bonus Score`
14. **2 Observers** claim `MGP` fee
15. Check balance after flow

### 9. Expired defend removal (Project 1, Package 4)

1. Add **package 4**
2. Add **3 collaborators**
3. Remove **Collaborator 1** with no `MGP`
4. **Collaborator 1** defend removal
5. Resolve dispute **Collaborator 1** with no `MGP`
6. Remove **Collaborator 2** with no `MGP`
7. Wait for 3 days -> Expired disputed for **Collaborator 2**
8. Approve **Collaborator 3**
9. Finish **package 4**
10. Pay `MGP` to **Collaborator 3**
11. **Collaborator 3** claim `MGP`
12. Check balance after flow

