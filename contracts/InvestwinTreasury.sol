// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title InvestwinTreasury
/// @notice Non-custodial claim treasury: the user submits and signs their own claim transaction.
/// The platform authorizes the claim off-chain with EIP-712; the contract enforces recipient,
/// nonce, expiry, replay protection, pause, and a per-wallet daily limit on-chain.
contract InvestwinTreasury {
    error NotOwner();
    error NotClaimSigner();
    error Paused();
    error InvalidToken();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidNonce();
    error Expired();
    error InvalidSignature();
    error DailyLimitExceeded();
    error TransferFailed();
    error InvalidSigner();

    uint256 public constant DAILY_LIMIT = 1_000e6; // USDT-style 6 decimals; owner may lower it.
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    address public immutable token;
    address public owner;
    address public claimSigner;
    uint256 public dailyLimit;
    bool public paused;

    mapping(address => uint256) public nextNonce;
    mapping(address => mapping(uint256 => uint256)) public claimedByDay;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ClaimSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event DailyLimitUpdated(uint256 previousLimit, uint256 newLimit);
    event TreasuryPaused(address indexed account);
    event Unpaused(address indexed account);
    event Claimed(address indexed recipient, uint256 amount, uint256 nonce, uint256 day);
    event EmergencyTokenSweep(address indexed token, address indexed recipient, uint256 amount);

    address public pendingOwner;

    constructor(address token_, address claimSigner_, uint256 dailyLimit_) {
        if (token_ == address(0) || claimSigner_ == address(0)) revert InvalidToken();
        if (dailyLimit_ == 0 || dailyLimit_ > DAILY_LIMIT) revert InvalidAmount();
        token = token_;
        owner = msg.sender;
        claimSigner = claimSigner_;
        dailyLimit = dailyLimit_;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Investwin Treasury")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidRecipient();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function setClaimSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidSigner();
        address previousSigner = claimSigner;
        claimSigner = newSigner;
        emit ClaimSignerUpdated(previousSigner, newSigner);
    }

    function setDailyLimit(uint256 newLimit) external onlyOwner {
        if (newLimit == 0 || newLimit > DAILY_LIMIT) revert InvalidAmount();
        uint256 previousLimit = dailyLimit;
        dailyLimit = newLimit;
        emit DailyLimitUpdated(previousLimit, newLimit);
    }

    function pause() external onlyOwner {
        paused = true;
        emit TreasuryPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @dev The user must submit this transaction from the recipient wallet.
    function claim(uint256 amount, uint256 nonce, uint256 deadline, bytes calldata signature)
        external
        whenNotPaused
    {
        if (msg.sender == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (block.timestamp > deadline) revert Expired();
        if (nonce != nextNonce[msg.sender]) revert InvalidNonce();

        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, amount, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        if (_recover(digest, signature) != claimSigner) revert InvalidSignature();

        uint256 day = block.timestamp / 1 days;
        uint256 newDailyTotal = claimedByDay[msg.sender][day] + amount;
        if (newDailyTotal > dailyLimit) revert DailyLimitExceeded();

        nextNonce[msg.sender] = nonce + 1;
        claimedByDay[msg.sender][day] = newDailyTotal;
        if (!IERC20(token).transfer(msg.sender, amount)) revert TransferFailed();
        emit Claimed(msg.sender, amount, nonce, day);
    }

    function tokenBalance() external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function emergencySweep(address token_, address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0) || amount == 0) revert InvalidRecipient();
        if (!IERC20(token_).transfer(recipient, amount)) revert TransferFailed();
        emit EmergencyTokenSweep(token_, recipient, amount);
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        // Reject malleable signatures: s must be in the lower half order.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert InvalidSignature();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSignature();
        return recovered;
    }
}
