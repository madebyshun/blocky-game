// The claim signature the BaseCity Blockies contract checks (contracts/BaseCityBlockies.sol):
// EIP-712 Claim(address to, bytes32 ids, bytes32 evict, uint256 deadline), where ids and evict are
// keccak256(abi.encodePacked(uint256[])). Shared by api/claim.js and the contract tests.
import { keccak256, encodePacked } from 'viem';

export const CLAIM_TYPES = {
  Claim: [
    { name: 'to', type: 'address' },
    { name: 'ids', type: 'bytes32' },
    { name: 'evict', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
};
export const packIds = (ids) => keccak256(encodePacked(['uint256[]'], [ids.map(BigInt)]));

export const claimTypedData = ({ chainId, contract, to, ids, evict, deadline }) => ({
  domain: { name: 'BaseCity Blockies', version: '1', chainId, verifyingContract: contract },
  types: CLAIM_TYPES,
  primaryType: 'Claim',
  message: { to, ids: packIds(ids), evict: packIds(evict), deadline: BigInt(deadline) },
});

export const CLAIM_ABI = [
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [{ name: 'ids', type: 'uint256[]' }, { name: 'evictIds', type: 'uint256[]' }, { name: 'deadline', type: 'uint256' }, { name: 'signature', type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'exists', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'unlocked', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'unlockAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAX_SUPPLY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'signer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
