// The signatures the BaseCity Blockies contract checks (contracts/BaseCityBlockies.sol), EIP-712:
// - Claim(address to, bytes32 ids, bytes32 evict, uint256 deadline, bool frozen): a wallet's claim.
//   `frozen`: whether the city is frozen (the contract's frozenAt), so a claim signed before the
//   freeze stops working at the freeze.
// - OpenMarket(bytes32 evict, uint256 deadline): burn these and open transfers, once frozen.
// ids and evict are keccak256(abi.encodePacked(uint256[])). Shared by api/claim.js and the tests.
import { keccak256, encodePacked } from 'viem';

export const CLAIM_TYPES = {
  Claim: [
    { name: 'to', type: 'address' },
    { name: 'ids', type: 'bytes32' },
    { name: 'evict', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
    { name: 'frozen', type: 'bool' },
  ],
};
export const OPEN_MARKET_TYPES = {
  OpenMarket: [
    { name: 'evict', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};
export const packIds = (ids) => keccak256(encodePacked(['uint256[]'], [ids.map(BigInt)]));

const domain = (chainId, contract) => ({ name: 'BaseCity Blockies', version: '1', chainId, verifyingContract: contract });
export const claimTypedData = ({ chainId, contract, to, ids, evict, deadline, frozen = false }) => ({
  domain: domain(chainId, contract),
  types: CLAIM_TYPES,
  primaryType: 'Claim',
  message: { to, ids: packIds(ids), evict: packIds(evict), deadline: BigInt(deadline), frozen: Boolean(frozen) },
});
export const openMarketTypedData = ({ chainId, contract, evict, deadline }) => ({
  domain: domain(chainId, contract),
  types: OPEN_MARKET_TYPES,
  primaryType: 'OpenMarket',
  message: { evict: packIds(evict), deadline: BigInt(deadline) },
});

export const CLAIM_ABI = [
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [{ name: 'ids', type: 'uint256[]' }, { name: 'evictIds', type: 'uint256[]' }, { name: 'deadline', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'exists', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'openMarket', stateMutability: 'nonpayable', inputs: [{ name: 'evictIds', type: 'uint256[]' }, { name: 'deadline', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'unlocked', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'unlockAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'frozenAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'frozenBlock', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_SUPPLY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'signer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'event', name: 'Unlocked', inputs: [{ name: 'by', type: 'address', indexed: false }] },
];
