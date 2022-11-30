// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ERC165CheckerUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { ITokenFactory } from "./interfaces/ITokenFactory.sol";
import { IOUToken } from "./IOUToken.sol";
import { INFTReward } from "./interfaces/INFTReward.sol";

/**
 *  @title  TokenFactory Contract
 *  @notice This contract using for creating IOU Token
 */
contract TokenFactory is OwnableUpgradeable, ITokenFactory {
    using ERC165CheckerUpgradeable for address;

    // Reference to Learn To Earn contract
    address public learnToEarn;

    /**
     * @dev NFTReward contract interface
     *      Using this contract to deploy new contract NFT for user
     */
    INFTReward public templateNFTReward;

    /**
     * @notice Initialize of contract (replace for constructor)
     * @param _nftRewared Address of NFTReward contract
     */
    function initialize(INFTReward _nftRewared) public initializer {
        __Ownable_init();

        require(address(_nftRewared).supportsInterface(type(INFTReward).interfaceId), "Invalid NFTReward address");
        templateNFTReward = _nftRewared;
    }

    /**
     * @notice Update LearnToEarn contract address
     * @param _learnToEarn LearnToEarn contract address
     * Emit {SetLearnToEarn}
     */
    function setLearnToEarn(address _learnToEarn) external onlyOwner {
        require(_learnToEarn != address(0), "learnToEarn address is not valid");
        address oldLearnToEarn = learnToEarn;
        learnToEarn = _learnToEarn;
        emit SetLearnToEarn(oldLearnToEarn, learnToEarn);
    }
    /**
     * @notice Deploys IOUT with totalSupply equal to project budget
     * @param _totalSupply Token total supply
     * @param _name Name of token
     * @param _symbol Symbol of token
     * @return token_ IOU token address
     * 
     * emit {DeployedToken} events
     */
    function deployToken(
        uint256 _totalSupply,
        string memory _name,
        string memory _symbol
    ) external returns (address token_) {
        token_ = address(new IOUToken(msg.sender, _totalSupply, _name, _symbol));
        emit DeployedToken(token_, _totalSupply);
    }
    
    /**
     * @dev Using Clones library to clone a contract instead of deploying new contract
     * @notice Deploy new contract to mint NFT
     * @param _name Name of NFT
     * @param _symbol Symbol of NFT
     * @param _uri Ipfs of NFT
     * @return address(nft_) address of new contract
     * 
     * emit {DeployedNFT} events
     */
    function deployNFT(string memory _name, string memory _symbol, string memory _uri) external returns (address) {
        require(learnToEarn != address(0), "LearnToEarn address is not valid");
        INFTReward nft_ = INFTReward(Clones.clone(address(templateNFTReward)));
        nft_.initialize(learnToEarn, _name, _symbol, _uri);

        emit DeployedNFT(address(nft_));
        return address(nft_);
    }
}
