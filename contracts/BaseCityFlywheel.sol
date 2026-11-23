// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BaseCityFlywheel
/// @notice Auto-push Epoch reward distributor & buyback-burn recorder for BaseCity ($BASECITY / $BLOCKY / BCB NFTs).
/// @dev Pushes ERC-20 rewards directly to NFT holder wallets in batches on Base. If a single recipient
///      reverts on transfer, its share is deferred instead of blocking the batch and can be claimed later.
contract BaseCityFlywheel is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address public operator;
    mapping(address => mapping(address => uint256)) public deferred;
    mapping(address => uint256) public totalDeferred;

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event EpochDistributed(
        uint256 indexed epoch,
        address indexed token,
        uint256 paidCount,
        uint256 totalPaid,
        uint256 totalDeferredInBatch
    );
    event PayoutDeferred(uint256 indexed epoch, address indexed token, address indexed recipient, uint256 amount);
    event DeferredClaimed(address indexed token, address indexed recipient, uint256 amount);
    event BuybackBurned(uint256 indexed epoch, address indexed token, uint256 amount);

    error NotAuthorized();
    error LengthMismatch();
    error ZeroAmount();
    error InsufficientFreeBalance();

    modifier onlyAuthorized() {
        if (msg.sender != owner() && msg.sender != operator) revert NotAuthorized();
        _;
    }

    constructor(address initialOwner, address initialOperator) Ownable(initialOwner) {
        operator = initialOperator;
        emit OperatorUpdated(address(0), initialOperator);
    }

    function setOperator(address newOperator) external onlyOwner {
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    /// @notice Auto-push ERC-20 rewards directly to holder wallets from this contract's balance.
    /// @dev Fund this contract first (e.g. via LaunchFactoryV3 setCreatorRecipient or transfer).
    function batchDisperse(
        address token,
        uint256 epoch,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyAuthorized nonReentrant {
        uint256 len = recipients.length;
        if (len != amounts.length || len == 0) revert LengthMismatch();

        {
            uint256 needed = _sumAmounts(amounts);
            if (needed == 0) revert ZeroAmount();
            uint256 freeBal = IERC20(token).balanceOf(address(this)) - totalDeferred[token];
            if (freeBal < needed) revert InsufficientFreeBalance();
        }

        uint256 paidCount = 0;
        uint256 totalPaid = 0;
        uint256 deferredBatch = 0;

        for (uint256 i = 0; i < len; ) {
            (bool paid, uint256 amt) = _disperseOne(token, epoch, recipients[i], amounts[i]);
            if (amt > 0) {
                if (paid) {
                    unchecked {
                        ++paidCount;
                        totalPaid += amt;
                    }
                } else {
                    unchecked { deferredBatch += amt; }
                }
            }
            unchecked { ++i; }
        }

        emit EpochDistributed(epoch, token, paidCount, totalPaid, deferredBatch);
    }

    function _sumAmounts(uint256[] calldata amounts) internal pure returns (uint256 needed) {
        uint256 len = amounts.length;
        for (uint256 i = 0; i < len; ) {
            needed += amounts[i];
            unchecked { ++i; }
        }
    }

    function _disperseOne(address token, uint256 epoch, address to, uint256 amt) internal returns (bool paid, uint256 processed) {
        if (to == address(0) || amt == 0) return (false, 0);
        if (_tryTransfer(token, to, amt)) return (true, amt);
        deferred[token][to] += amt;
        totalDeferred[token] += amt;
        emit PayoutDeferred(epoch, token, to, amt);
        return (false, amt);
    }

    /// @notice Fallback claim if a holder's smart-contract wallet ever rejected an auto-push transfer.
    function claimDeferred(address token) external nonReentrant {
        uint256 amt = deferred[token][msg.sender];
        if (amt == 0) revert ZeroAmount();
        deferred[token][msg.sender] = 0;
        totalDeferred[token] -= amt;
        IERC20(token).safeTransfer(msg.sender, amt);
        emit DeferredClaimed(token, msg.sender, amt);
    }

    /// @notice Sends bought-back $BASECITY or $BLOCKY permanently to 0x...dEaD with an on-chain epoch log.
    function burnBuyback(address token, uint256 epoch, uint256 amount) external onlyAuthorized nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 freeBal = IERC20(token).balanceOf(address(this)) - totalDeferred[token];
        if (freeBal < amount) revert InsufficientFreeBalance();
        IERC20(token).safeTransfer(DEAD, amount);
        emit BuybackBurned(epoch, token, amount);
    }

    /// @notice Withdraws unallocated treasury/ops tokens without touching deferred holder balances.
    function withdrawTreasury(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        uint256 freeBal = IERC20(token).balanceOf(address(this)) - totalDeferred[token];
        if (freeBal < amount) revert InsufficientFreeBalance();
        IERC20(token).safeTransfer(to, amount);
    }

    function _tryTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}
