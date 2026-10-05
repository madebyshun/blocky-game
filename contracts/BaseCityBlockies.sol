// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";

/// @title BaseCity Blockies (BCB)
/// @notice The builders of BaseCity, a voxel city on Base built 24/7. Every $5 of $BLOCKY a wallet buys
/// brings one Blocky to the city; that wallet claims it here, with a signature from the BaseCity
/// ledger, and pays the gas. Token id = the Blocky's number (#1, #2, ...), never reused.
///
/// - At most MAX_SUPPLY Blockies exist at once.
/// - Until the collection unlocks, Blockies can't be transferred or approved, and a Blocky whose
///   wallet sold its $BLOCKY leaves the city: the ledger lists it for eviction (burned, its number
///   never comes back) and its place goes to the next buyer.
/// - The collection unlocks by itself once MAX_SUPPLY Blockies exist (or when the owner unlocks it).
///   From then on Blockies are ordinary NFTs, free to trade, and none can be evicted.
contract BaseCityBlockies is ERC721, ERC2981, Ownable, EIP712, IERC4906 {
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(address to,bytes32 ids,bytes32 evict,uint256 deadline)");

    uint256 public immutable MAX_SUPPLY;
    address public signer;
    bool public unlocked;
    uint256 public totalSupply; // Blockies that exist now
    uint256 public totalMinted; // Blockies ever claimed
    mapping(uint256 => bool) public evicted;

    string private _base;
    string private _contractURI;

    event Claimed(address indexed to, uint256 count);
    event Evicted(uint256 indexed id, address indexed from);
    event Unlocked();
    event SignerUpdated(address signer);
    event ContractURIUpdated();

    error Expired();
    error BadSignature();
    error Locked();
    error AlreadyUnlocked();
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

    /// @notice Claim the Blockies the ledger signed for you. `evictIds` lists Blockies that left the city
    /// (their wallets sold); while the collection is locked they are burned first. Ids that already
    /// exist or were evicted are skipped, so an old signature never reverts on them.
    function claim(uint256[] calldata ids, uint256[] calldata evictIds, uint256 deadline, bytes calldata signature)
        external
    {
        if (block.timestamp > deadline) revert Expired();
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    CLAIM_TYPEHASH,
                    msg.sender,
                    keccak256(abi.encodePacked(ids)),
                    keccak256(abi.encodePacked(evictIds)),
                    deadline
                )
            )
        );
        if (ECDSA.recover(digest, signature) != signer) revert BadSignature();

        if (!unlocked) for (uint256 i; i < evictIds.length; ++i) _evict(evictIds[i]);
        uint256 count;
        for (uint256 i; i < ids.length && totalSupply < MAX_SUPPLY; ++i) {
            uint256 id = ids[i];
            if (evicted[id] || _ownerOf(id) != address(0)) continue;
            _mint(msg.sender, id);
            ++count;
        }
        if (count > 0) emit Claimed(msg.sender, count);
        if (!unlocked && totalSupply >= MAX_SUPPLY) _unlock();
    }

    /// @notice True if Blocky `id` has been claimed and not evicted.
    function exists(uint256 id) external view returns (bool) {
        return _ownerOf(id) != address(0);
    }

    // ---------- the owner ----------

    /// @notice Evict Blockies whose wallets sold (only while the collection is locked).
    function evict(uint256[] calldata ids) external onlyOwner {
        if (unlocked) revert AlreadyUnlocked();
        for (uint256 i; i < ids.length; ++i) _evict(ids[i]);
    }

    /// @notice Open transfers before every Blocky is claimed. Can't be undone.
    function unlock() external onlyOwner {
        if (unlocked) revert AlreadyUnlocked();
        _unlock();
    }

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

    // ---------- the lock ----------

    function approve(address to, uint256 tokenId) public override(ERC721, IERC721) {
        if (!unlocked) revert Locked();
        super.approve(to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) public override(ERC721, IERC721) {
        if (!unlocked && approved) revert Locked();
        super.setApprovalForAll(operator, approved);
    }

    // Mints and burns count the supply; transfers wait for the unlock.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        if (!unlocked && to != address(0) && _ownerOf(tokenId) != address(0)) revert Locked();
        from = super._update(to, tokenId, auth);
        if (from == address(0)) {
            ++totalSupply;
            ++totalMinted;
        } else if (to == address(0)) {
            --totalSupply;
        }
    }

    function _evict(uint256 id) private {
        address holder = _ownerOf(id);
        if (holder == address(0)) return;
        evicted[id] = true;
        _burn(id);
        emit Evicted(id, holder);
    }

    function _unlock() private {
        unlocked = true;
        emit Unlocked();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}
