// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface ITokenFactory {
    event DeployedToken(address indexed token, uint256 indexed totalSupply);
    event SetLearnToEarn(address indexed oldLearnToEarn, address indexed newLearnToEarn);
    event DeployedNFT(address indexed nft);

    /**
     * @notice Deploys IOUT with totalSupply equal to project budget
     * @param _totalSupply Token total supply
     * @param _name Name of token
     * @param _symbol Symbol of token
     * @return token_ IOU token address
     *
     * emit {DeployedToken} events
     */
    function deployToken(uint256 _totalSupply, string memory _name, string memory _symbol) external returns (address);

    /**
     * @notice Deploy new contract to mint NFT
     * @param _name Name of NFT
     * @param _symbol Symbol of NFT
     * @param _uri Ipfs of NFT
     * @return nft_ address
     *
     * emit {DeployedNFT} events
     */
    function deployNFT(string memory _name, string memory _symbol, string memory _uri) external returns (address);
}
