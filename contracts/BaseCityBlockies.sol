// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";

/// @title BaseCity Blockies (BCB)
/// @notice The citizens of BaseCity, a voxel city on Base built 24/7. Every few dollars of $BLOCKY a
/// wallet buys (the ledger's price per Blocky) brings one Blocky to the city. A newcomer leaves if its
/// wallet sells; after its first days in the city (the ledger's citizenship period) it is a citizen for
/// good, and its wallet claims it here with a signature from the BaseCity ledger, paying the gas.
/// Only citizens are ever signed, so every Blocky minted here is an ordinary NFT, free to trade from
/// the start, and none is ever taken back. Token id = the Blocky's number (#1, #2, ...).
contract BaseCityBlockies is ERC721, ERC2981, Ownable, EIP712, IERC4906 {
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(address to,bytes32 ids,uint256 deadline)");

    uint256 public immutable MAX_SUPPLY;
    address public signer;
    uint256 public totalSupply;

    string private _base;
    string private _contractURI;

    event Claimed(address indexed to, uint256 count);
    event SignerUpdated(address signer);
    event ContractURIUpdated();

    error Expired();
    error BadSignature();
    error ZeroAddress();

    constructor(
        address owner_,
        address signer_,
        address royaltyReceiver,
        uint96 royaltyBps,
        uint256 maxSupply,
        string memory baseURI_,
        string memory contractURI_
    ) ERC721("BaseCity Blockies", "BCB") Ownable(owner_) EIP712("BaseCity Blockies", "1") {
        if (signer_ == address(0)) revert ZeroAddress();
        signer = signer_;
        MAX_SUPPLY = maxSupply;
        _base = baseURI_;
        _contractURI = contractURI_;
        _setDefaultRoyalty(royaltyReceiver, royaltyBps);
    }

    // ---------- claiming ----------

    /// @notice Claim the citizens the ledger signed for you. Ids that already exist are skipped, so a
    /// signature never mints twice; claims stop at MAX_SUPPLY.
    function claim(uint256[] calldata ids, uint256 deadline, bytes calldata signature) external {
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, keccak256(abi.encodePacked(ids)), deadline))
        );
        if (ECDSA.recover(digest, signature) != signer) revert BadSignature();

        uint256 count;
        for (uint256 i; i < ids.length && totalSupply < MAX_SUPPLY; ++i) {
            if (_ownerOf(ids[i]) != address(0)) continue;
            _mint(msg.sender, ids[i]);
            ++totalSupply;
            ++count;
        }
        if (count > 0) emit Claimed(msg.sender, count);
    }

    /// @notice True if Blocky `id` has been claimed.
    function exists(uint256 id) external view returns (bool) {
        return _ownerOf(id) != address(0);
    }

    // ---------- the owner ----------

    /// @notice A new key for the ledger's signatures (if the old one ever leaks).
    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert ZeroAddress();
        signer = signer_;
        emit SignerUpdated(signer_);
    }

    /// @notice Also asks marketplaces to refresh every Blocky's metadata (ERC-4906).
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _base = baseURI_;
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    function setContractURI(string calldata contractURI_) external onlyOwner {
        _contractURI = contractURI_;
        emit ContractURIUpdated();
    }

    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        _setDefaultRoyalty(receiver, bps);
    }

    // ---------- metadata ----------

    function contractURI() external view returns (string memory) {
        return _contractURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _base;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}
