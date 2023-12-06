# Integration Test

This is test flows for integration testing phase.

> All flows will running with contracts deployed in [Before](#before-Deploy-contracts)

## Test flows

Each flow will run sequence by sequence

### Before get in flows testing

1. Prepare users
2. Deploy `IOUToken` contract
3. Deploy `NFTReward` contract
3. Deploy `ERC721Test` contract
3. Deploy `TokenFactory` contract
3. Deploy `LearnToEarn` contract
4. Link `LearnToEarn` contract with `TokenFactory` contract
5. Setting up `Balance Trackers`
6. Local environments

### 1. Verify contract parameter
1. Verify `NFTReward` contract parameters
2. Verify `TokenFactory` contract parameters
3. Verify `LearnToEarn` contract parameters

### 2. Create new course with existed token and duration time bonus (Course 1)
1. Create **course 1** with existed token and duration 30 days
2. **Learner 1, 2** complete and receive bonus
3. **Creator** add new budget to course
4. **Learner 3** complete and receive bonus
5. Check balance after flow

### 3. Create new course with existed token and specific date bonus (Course 2)
1. Create **course 2** with existed token and time bonus to next 45 days
2. **Learner 1, 2** complete and receive bonus
3. Skip 45 days and **Learner 3** complete but not receive bonus
4. **Creator** withdraw budget
5. Check balance after flow

### 4. Create new course with external NFT contract (Course 3)
1. **Creator** mint NFTs
2. Create **course 3** with external NFT contract and time bonus to next 45 days
3. **Learner 1, 2** complete and receive NFT(s)
4. **Learner 3** completed but not receive NFT(s) because of out budget
5. **Creator** add budget to course
6. **Learner 4** complete and receive NFT(s)
7. **Creator** withdraw budget but reverted
8. Check balance after flow

### 5. Create new course with NFT contract deployed by system (Course 4)
1. Create **course 4** with NFT contract deployed by system and time duration 60 days
2. **Learner 1, 2** complete and receive NFT(s)
3. **Learner 3** completed but not receive NFT(s) because out of deadline
4. **Learner 4** complete and receive NFT(s)
5. **Creator** withdraw budget but reverted
6. Check balance after flow

### 6. Learner completed twice in one course (Course 5)
1. Create **course 5** with existed token and time bonus to next 45 days
2. **Learner 1, 2** complete and receive bonus
3. **Creator** add new budget to course
4. **Learner 1** complete and receive bonus but reverted
5. **Creator** withdraw budget
6. Check balance after flow

### 7. Creator withdraw after adding budget (Course 6)
1. Create **course 6** with existed token and time bonus to next 45 days
2. **Learner 1, 2, 3** complete and receive bonus
3. **Creator** withdraw budget but reverted
4. **Creator** add budget to course
5. **Creator** withdraw budget
6. Check balance after flow

### 8. Creator create course with external NFT contract but have not minted NFT before (Course 7)
1. Create **course 7** with external NFT contract and time bonus to next 45 days but reverted because of have not minted NFT before
2. **Creator** mint NFTs
3. Create **course 7**
4. **Learner 1, 2** complete and receive NFT(s)
5. **Creator** add budget but have not minted NFTs
6. **Creator** mint NFTs
7. **Creator** add budget
8. **Learner 3** complete and receive NFT(s)
9. Check balance after flow

### 9. Creator create course with external NFT contract but transfer NFTs to other before (Course 8)
1. **Creator** mint NFTs
2. Create **course 8** with external NFT contract and time bonus to next 45 days
3. **Creator** transfer NFTs to other user
4. **Learner 1** complete and receive NFT(s) but reverted
5. **Creator** mint new NFTs to transfer to **Learner 1**
6. Transfer NFTs for **Learner 1**
7. **Creator** mint new NFTS to add budget but balance is not greater than or equal to budgetAvailable
8. **Creator** mint new NFTs and add budget
9. **Learner 2, 3** complete and receive bonus
10. Check balance after flow