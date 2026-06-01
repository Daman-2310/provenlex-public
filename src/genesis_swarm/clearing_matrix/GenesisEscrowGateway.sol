// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title  GenesisEscrowGateway
/// @notice Atomic transaction-isolation gate. Tokenised (ERC-3643 / ERC-20)
///         capital transfers are held in cryptographic escrow until the Genesis
///         BFT backend either RELEASES them to the beneficiary or LOCKS them on
///         a detected compliance breach. The release/lock decision is gated by a
///         BFT consensus multi-sig (M-of-N signers), so no single key can move
///         held capital.
/// @dev    Reentrancy-guarded, pausable, with full event surface for the
///         off-chain indexer. Targets pragma ^0.8.20 (checked arithmetic).
contract GenesisEscrowGateway {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────
    enum HoldStatus { None, Held, Released, Locked }

    struct EscrowHold {
        address token;        // address(0) == native asset
        address from;
        address to;
        uint256 amount;
        uint64  createdAt;
        uint64  resolvedAt;
        HoldStatus status;
        bytes32 complianceRef; // hash of the off-chain compliance evaluation
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────
    mapping(bytes32 => EscrowHold) public holds;     // holdId => hold
    mapping(address => bool) public isSigner;        // BFT consensus signer set
    mapping(bytes32 => mapping(address => bool)) public hasApproved; // holdId => signer => approved
    mapping(bytes32 => uint256) public approvalCount;

    uint256 public signerCount;
    uint256 public threshold;                         // M-of-N required approvals
    address public admin;
    bool public paused;

    // Locked capital is swept here pending regulator instruction.
    address public lockVault;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────
    event Deposited(bytes32 indexed holdId, address indexed from, address indexed to, address token, uint256 amount);
    event Approved(bytes32 indexed holdId, address indexed signer, uint256 count, uint256 threshold);
    event Released(bytes32 indexed holdId, address indexed to, uint256 amount, bytes32 complianceRef);
    event Locked(bytes32 indexed holdId, address indexed vault, uint256 amount, bytes32 complianceRef);
    event SignerUpdated(address indexed signer, bool enabled, uint256 signerCount);
    event ThresholdUpdated(uint256 threshold);
    event PausedSet(bool paused);

    // ─────────────────────────────────────────────────────────────────────────
    // Reentrancy guard
    // ─────────────────────────────────────────────────────────────────────────
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "NOT_ADMIN");
        _;
    }

    modifier onlySigner() {
        require(isSigner[msg.sender], "NOT_SIGNER");
        _;
    }

    modifier notPaused() {
        require(!paused, "PAUSED");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Construction
    // ─────────────────────────────────────────────────────────────────────────
    constructor(address[] memory signers, uint256 _threshold, address _lockVault) {
        require(_lockVault != address(0), "ZERO_VAULT");
        require(signers.length > 0, "NO_SIGNERS");
        require(_threshold > 0 && _threshold <= signers.length, "BAD_THRESHOLD");
        admin = msg.sender;
        lockVault = _lockVault;
        for (uint256 i = 0; i < signers.length; i++) {
            address s = signers[i];
            require(s != address(0), "ZERO_SIGNER");
            if (!isSigner[s]) {
                isSigner[s] = true;
                signerCount += 1;
                emit SignerUpdated(s, true, signerCount);
            }
        }
        threshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Ingress — capital enters escrow
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deposit native asset into escrow. Returns the deterministic holdId.
    function depositNative(address to, bytes32 salt) external payable notPaused nonReentrant returns (bytes32 holdId) {
        require(msg.value > 0, "ZERO_AMOUNT");
        require(to != address(0), "ZERO_TO");
        holdId = keccak256(abi.encodePacked(msg.sender, to, address(0), msg.value, salt, block.number));
        require(holds[holdId].status == HoldStatus.None, "HOLD_EXISTS");
        holds[holdId] = EscrowHold({
            token: address(0),
            from: msg.sender,
            to: to,
            amount: msg.value,
            createdAt: uint64(block.timestamp),
            resolvedAt: 0,
            status: HoldStatus.Held,
            complianceRef: bytes32(0)
        });
        emit Deposited(holdId, msg.sender, to, address(0), msg.value);
    }

    /// @notice Deposit ERC-20 / ERC-3643 tokens into escrow (caller must approve first).
    function depositToken(address token, address to, uint256 amount, bytes32 salt)
        external notPaused nonReentrant returns (bytes32 holdId)
    {
        require(amount > 0, "ZERO_AMOUNT");
        require(to != address(0) && token != address(0), "ZERO_ADDR");
        holdId = keccak256(abi.encodePacked(msg.sender, to, token, amount, salt, block.number));
        require(holds[holdId].status == HoldStatus.None, "HOLD_EXISTS");

        // Pull tokens in. Uses low-level call to tolerate non-standard ERC-20s.
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount) // transferFrom
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");

        holds[holdId] = EscrowHold({
            token: token,
            from: msg.sender,
            to: to,
            amount: amount,
            createdAt: uint64(block.timestamp),
            resolvedAt: 0,
            status: HoldStatus.Held,
            complianceRef: bytes32(0)
        });
        emit Deposited(holdId, msg.sender, to, token, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BFT consensus approval + resolution
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice A BFT signer approves a resolution for a hold. Once `threshold`
    ///         distinct signers approve, `releaseOrLockTransaction` can execute.
    function approve(bytes32 holdId) external onlySigner {
        require(holds[holdId].status == HoldStatus.Held, "NOT_HELD");
        require(!hasApproved[holdId][msg.sender], "ALREADY_APPROVED");
        hasApproved[holdId][msg.sender] = true;
        approvalCount[holdId] += 1;
        emit Approved(holdId, msg.sender, approvalCount[holdId], threshold);
    }

    /// @notice Release the held capital to the beneficiary, or lock it into the
    ///         vault, depending on `release`. Requires M-of-N BFT approvals.
    /// @param  holdId        the escrow hold identifier
    /// @param  release       true => settle to beneficiary; false => lock to vault
    /// @param  complianceRef hash of the off-chain compliance evaluation record
    function releaseOrLockTransaction(bytes32 holdId, bool release, bytes32 complianceRef)
        external onlySigner nonReentrant
    {
        EscrowHold storage h = holds[holdId];
        require(h.status == HoldStatus.Held, "NOT_HELD");
        require(approvalCount[holdId] >= threshold, "INSUFFICIENT_APPROVALS");

        h.resolvedAt = uint64(block.timestamp);
        h.complianceRef = complianceRef;
        address recipient = release ? h.to : lockVault;
        h.status = release ? HoldStatus.Released : HoldStatus.Locked;

        if (h.token == address(0)) {
            (bool ok, ) = payable(recipient).call{value: h.amount}("");
            require(ok, "NATIVE_SEND_FAILED");
        } else {
            (bool ok, bytes memory data) = h.token.call(
                abi.encodeWithSelector(0xa9059cbb, recipient, h.amount) // transfer
            );
            require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
        }

        if (release) {
            emit Released(holdId, recipient, h.amount, complianceRef);
        } else {
            emit Locked(holdId, recipient, h.amount, complianceRef);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────
    function setSigner(address signer, bool enabled) external onlyAdmin {
        require(signer != address(0), "ZERO_SIGNER");
        if (enabled && !isSigner[signer]) {
            isSigner[signer] = true;
            signerCount += 1;
        } else if (!enabled && isSigner[signer]) {
            isSigner[signer] = false;
            signerCount -= 1;
            require(signerCount >= threshold, "BELOW_THRESHOLD");
        }
        emit SignerUpdated(signer, enabled, signerCount);
    }

    function setThreshold(uint256 _threshold) external onlyAdmin {
        require(_threshold > 0 && _threshold <= signerCount, "BAD_THRESHOLD");
        threshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function getHold(bytes32 holdId) external view returns (EscrowHold memory) {
        return holds[holdId];
    }
}
