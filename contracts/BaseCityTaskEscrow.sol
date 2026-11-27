// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBalanceOf {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title BaseCityTaskEscrow
/// @notice Permissionless ERC-20 task escrow with pluggable Evaluator & NFT/Agent gating for BaseCity Work HQ.
/// @dev Supports Base USDC and Coinbase Tokenized Stock ERC-20 rewards. Protocol fees flow directly into BaseCityFlywheel.
///
/// v2 rules that protect the people doing the work:
///  - A requester who judges their own task (evaluator == requester) cannot `reject` once work is in.
///  - After the deadline there is a REVIEW_WINDOW. If nobody decides in that time, `settleDefault` runs:
///      * evaluator == requester: the FIRST submitter is paid (silence means acceptance);
///      * third-party evaluator: the requester is refunded (the evaluator went missing).
///  - `refundExpired` only works on tasks nobody submitted to.
///  - The fee rate is fixed when the task is created, so the owner can't change it for open tasks.
///  - Tokens that take a cut on transfer are refused (the contract must receive exactly `amount`).
///  - The evaluator can't submit work to the task it judges.
contract BaseCityTaskEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Mode {
        Bounty,
        Claim
    }

    enum Gate {
        Open,
        BlockyNft,
        Erc8004Agent
    }

    enum Status {
        Open,
        Completed,
        Rejected,
        Refunded,
        Cancelled
    }

    struct Task {
        address requester;
        address evaluator;
        address token;
        uint256 amount;
        uint64 deadline;
        Mode mode;
        Gate gate;
        Status status;
        bytes32 criteriaHash;
        address claimedBy;
        address winner;
        uint32 submissionCount;
        uint16 feeBps; // fee rate fixed at creation
        address firstSubmitter;
    }

    uint16 public constant MAX_FEE_BPS = 1000; // 10% hard cap
    uint64 public constant REVIEW_WINDOW = 3 days; // time after the deadline for the evaluator to decide

    address public flywheel;
    address public blockyNft;
    address public agentRegistry;
    uint16 public feeBps; // e.g. 300 = 3%
    uint256 public nextTaskId = 1;

    mapping(uint256 => Task) public tasks;
    mapping(uint256 => mapping(address => bytes32)) public submissions;

    event FlywheelUpdated(address indexed previousFlywheel, address indexed newFlywheel);
    event FeeBpsUpdated(uint16 previousFeeBps, uint16 newFeeBps);
    event RegistriesUpdated(address indexed blockyNft, address indexed agentRegistry);
    event TaskCreated(
        uint256 indexed taskId,
        address indexed requester,
        address indexed evaluator,
        address token,
        uint256 amount,
        uint64 deadline,
        Mode mode,
        Gate gate,
        bytes32 criteriaHash
    );
    event TaskClaimed(uint256 indexed taskId, address indexed worker);
    event TaskUnclaimed(uint256 indexed taskId, address indexed worker);
    event WorkSubmitted(uint256 indexed taskId, address indexed worker, bytes32 deliveryHash);
    event TaskCompleted(
        uint256 indexed taskId,
        address indexed evaluator,
        address indexed winner,
        uint256 workerPayout,
        uint256 flywheelFee,
        bytes32 attestationHash
    );
    event TaskRejected(uint256 indexed taskId, address indexed evaluator, bytes32 reasonHash);
    event TaskRefunded(uint256 indexed taskId, address indexed requester, uint256 amount);
    event TaskCancelled(uint256 indexed taskId, address indexed requester, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error InvalidDeadline();
    error InvalidFeeBps();
    error TaskNotFound();
    error TaskNotOpen();
    error TaskExpired();
    error TaskNotExpired();
    error NotRequester();
    error NotEvaluator();
    error SelfWorkForbidden();
    error WrongMode();
    error AlreadyClaimed();
    error NotClaimer();
    error AlreadySubmitted();
    error WinnerDidNotSubmit();
    error HasSubmissions();
    error GateFailed();
    error RequesterCannotReject();
    error HasNoSubmissions();
    error ReviewWindowOpen();
    error TokenTakesFee();

    constructor(
        address initialOwner,
        address initialFlywheel,
        address initialBlockyNft,
        address initialAgentRegistry,
        uint16 initialFeeBps
    ) Ownable(initialOwner) {
        if (initialFlywheel == address(0)) revert ZeroAddress();
        if (initialFeeBps > MAX_FEE_BPS) revert InvalidFeeBps();
        flywheel = initialFlywheel;
        blockyNft = initialBlockyNft;
        agentRegistry = initialAgentRegistry;
        feeBps = initialFeeBps;
        emit FlywheelUpdated(address(0), initialFlywheel);
        emit FeeBpsUpdated(0, initialFeeBps);
        emit RegistriesUpdated(initialBlockyNft, initialAgentRegistry);
    }

    function setFlywheel(address newFlywheel) external onlyOwner {
        if (newFlywheel == address(0)) revert ZeroAddress();
        emit FlywheelUpdated(flywheel, newFlywheel);
        flywheel = newFlywheel;
    }

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFeeBps();
        emit FeeBpsUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function setRegistries(address newBlockyNft, address newAgentRegistry) external onlyOwner {
        blockyNft = newBlockyNft;
        agentRegistry = newAgentRegistry;
        emit RegistriesUpdated(newBlockyNft, newAgentRegistry);
    }

    /// @notice Lock ERC-20 reward upfront and designate the Evaluator & acceptance criteria hash.
    function createTask(
        address token,
        uint256 amount,
        address evaluator,
        uint64 deadline,
        Mode mode,
        Gate gate,
        bytes32 criteriaHash
    ) external nonReentrant returns (uint256 taskId) {
        if (token == address(0) || evaluator == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        taskId = nextTaskId++;
        Task storage t = tasks[taskId];
        t.requester = msg.sender;
        t.evaluator = evaluator;
        t.token = token;
        t.amount = amount;
        t.deadline = deadline;
        t.mode = mode;
        t.gate = gate;
        t.status = Status.Open;
        t.criteriaHash = criteriaHash;
        t.feeBps = feeBps;

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) - before != amount) revert TokenTakesFee();

        emit TaskCreated(taskId, msg.sender, evaluator, token, amount, deadline, mode, gate, criteriaHash);
    }

    /// @notice Exclusively lock a Claim-mode task before working.
    function claimTask(uint256 taskId) external {
        Task storage t = _requireOpen(taskId);
        if (block.timestamp > t.deadline) revert TaskExpired();
        if (t.mode != Mode.Claim) revert WrongMode();
        if (msg.sender == t.requester) revert SelfWorkForbidden();
        if (t.claimedBy != address(0)) revert AlreadyClaimed();
        _checkGate(t.gate, msg.sender);

        t.claimedBy = msg.sender;
        emit TaskClaimed(taskId, msg.sender);
    }

    /// @notice Release an active Claim lock (callable by claimer or requester).
    function unclaimTask(uint256 taskId) external {
        Task storage t = _requireOpen(taskId);
        if (t.mode != Mode.Claim) revert WrongMode();
        if (t.claimedBy == address(0) || (msg.sender != t.claimedBy && msg.sender != t.requester)) {
            revert NotClaimer();
        }
        address prev = t.claimedBy;
        t.claimedBy = address(0);
        emit TaskUnclaimed(taskId, prev);
    }

    /// @notice Record a deliverable hash onchain. Enforces Gate & Claim lock.
    function submitWork(uint256 taskId, bytes32 deliveryHash) external {
        Task storage t = _requireOpen(taskId);
        if (block.timestamp > t.deadline) revert TaskExpired();
        if (msg.sender == t.requester || msg.sender == t.evaluator) revert SelfWorkForbidden();
        if (deliveryHash == bytes32(0)) revert ZeroAmount();
        _checkGate(t.gate, msg.sender);

        if (t.mode == Mode.Claim) {
            if (t.claimedBy == address(0)) {
                t.claimedBy = msg.sender;
                emit TaskClaimed(taskId, msg.sender);
            } else if (t.claimedBy != msg.sender) {
                revert AlreadyClaimed();
            }
        }
        if (submissions[taskId][msg.sender] != bytes32(0)) revert AlreadySubmitted();

        submissions[taskId][msg.sender] = deliveryHash;
        if (t.submissionCount == 0) t.firstSubmitter = msg.sender;
        unchecked {
            ++t.submissionCount;
        }
        emit WorkSubmitted(taskId, msg.sender, deliveryHash);
    }

    /// @notice Evaluator approves a winning submission, releasing payout to winner and fee to BaseCityFlywheel.
    function complete(
        uint256 taskId,
        address winner,
        bytes32 attestationHash
    ) external nonReentrant {
        Task storage t = _requireOpen(taskId);
        if (msg.sender != t.evaluator) revert NotEvaluator();
        if (submissions[taskId][winner] == bytes32(0)) revert WinnerDidNotSubmit();

        _pay(taskId, t, winner, attestationHash);
    }

    function _pay(uint256 taskId, Task storage t, address winner, bytes32 attestationHash) internal {
        t.status = Status.Completed;
        t.winner = winner;

        uint256 fee = (t.amount * t.feeBps) / 10_000;
        uint256 payout = t.amount - fee;

        if (fee > 0) {
            IERC20(t.token).safeTransfer(flywheel, fee);
        }
        IERC20(t.token).safeTransfer(winner, payout);

        emit TaskCompleted(taskId, t.evaluator, winner, payout, fee, attestationHash);
    }

    /// @notice Evaluator rejects all work and refunds 100% of escrowed reward to requester.
    function reject(uint256 taskId, bytes32 reasonHash) external nonReentrant {
        Task storage t = _requireOpen(taskId);
        if (msg.sender != t.evaluator) revert NotEvaluator();
        if (t.evaluator == t.requester && t.submissionCount > 0) revert RequesterCannotReject();

        t.status = Status.Rejected;
        IERC20(t.token).safeTransfer(t.requester, t.amount);

        emit TaskRejected(taskId, msg.sender, reasonHash);
    }

    /// @notice Permissionless refund to requester once the deadline has passed and nobody submitted anything.
    function refundExpired(uint256 taskId) external nonReentrant {
        Task storage t = _requireOpen(taskId);
        if (block.timestamp <= t.deadline) revert TaskNotExpired();
        if (t.submissionCount > 0) revert HasSubmissions();

        t.status = Status.Refunded;
        IERC20(t.token).safeTransfer(t.requester, t.amount);

        emit TaskRefunded(taskId, t.requester, t.amount);
    }

    /// @notice Permissionless: nobody decided within REVIEW_WINDOW after the deadline, and work was submitted.
    /// A requester who was judging their own task pays the first submitter; if a third-party evaluator went
    /// missing, the requester is refunded.
    function settleDefault(uint256 taskId) external nonReentrant {
        Task storage t = _requireOpen(taskId);
        if (t.submissionCount == 0) revert HasNoSubmissions();
        if (block.timestamp <= uint256(t.deadline) + REVIEW_WINDOW) revert ReviewWindowOpen();

        if (t.evaluator == t.requester) {
            _pay(taskId, t, t.firstSubmitter, bytes32("DEFAULT"));
        } else {
            t.status = Status.Refunded;
            IERC20(t.token).safeTransfer(t.requester, t.amount);
            emit TaskRefunded(taskId, t.requester, t.amount);
        }
    }

    /// @notice Requester can cancel and recover escrow only if no submissions have been made yet.
    function cancelTask(uint256 taskId) external nonReentrant {
        Task storage t = _requireOpen(taskId);
        if (msg.sender != t.requester) revert NotRequester();
        if (t.submissionCount > 0) revert HasSubmissions();

        t.status = Status.Cancelled;
        IERC20(t.token).safeTransfer(t.requester, t.amount);

        emit TaskCancelled(taskId, t.requester, t.amount);
    }

    function _requireOpen(uint256 taskId) internal view returns (Task storage t) {
        t = tasks[taskId];
        if (t.requester == address(0)) revert TaskNotFound();
        if (t.status != Status.Open) revert TaskNotOpen();
    }

    function _checkGate(Gate gate, address worker) internal view {
        if (gate == Gate.Open) return;
        address reg = gate == Gate.BlockyNft ? blockyNft : agentRegistry;
        if (reg == address(0)) revert GateFailed();
        if (IBalanceOf(reg).balanceOf(worker) == 0) revert GateFailed();
    }
}
