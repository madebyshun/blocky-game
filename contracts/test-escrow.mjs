// End-to-end EVM unit tests for BaseCityTaskEscrow.sol on an in-memory Base (Cancun, chainId 8453).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import solc from 'solc';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { createAddressFromString, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { createBlock } from '@ethereumjs/block';
import { encodeFunctionData, decodeFunctionResult, decodeErrorResult, encodeDeployData, decodeEventLog, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const escrowArt = JSON.parse(readFileSync(new URL('./out/BaseCityTaskEscrow.json', import.meta.url)));

// Compile tiny mock ERC20 + ERC721 in memory for testing escrow transfers & NFT/Agent gates
const MOCK_SOL = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
contract MockERC20 {
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
  function approve(address spender, uint256 amt) external returns (bool) { allowance[msg.sender][spender] = amt; return true; }
  function transfer(address to, uint256 amt) external returns (bool) {
    require(balanceOf[msg.sender] >= amt, "bal");
    balanceOf[msg.sender] -= amt; balanceOf[to] += amt; return true;
  }
  function transferFrom(address from, address to, uint256 amt) external returns (bool) {
    require(balanceOf[from] >= amt && allowance[from][msg.sender] >= amt, "allow");
    allowance[from][msg.sender] -= amt; balanceOf[from] -= amt; balanceOf[to] += amt; return true;
  }
}
contract MockFeeToken {
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;
  function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
  function approve(address spender, uint256 amt) external returns (bool) { allowance[msg.sender][spender] = amt; return true; }
  function transfer(address to, uint256 amt) external returns (bool) { balanceOf[msg.sender] -= amt; balanceOf[to] += amt - amt / 100; return true; }
  function transferFrom(address from, address to, uint256 amt) external returns (bool) {
    require(balanceOf[from] >= amt && allowance[from][msg.sender] >= amt, "allow");
    allowance[from][msg.sender] -= amt; balanceOf[from] -= amt; balanceOf[to] += amt - amt / 100; return true;
  }
}
contract MockNFT {
  mapping(address => uint256) public balanceOf;
  function setBal(address who, uint256 n) external { balanceOf[who] = n; }
}
`;

const compiledMocks = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { 'Mocks.sol': { content: MOCK_SOL } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
})));
const erc20Art = { abi: compiledMocks.contracts['Mocks.sol'].MockERC20.abi, bytecode: `0x${compiledMocks.contracts['Mocks.sol'].MockERC20.evm.bytecode.object}` };
const feeArt = { abi: compiledMocks.contracts['Mocks.sol'].MockFeeToken.abi, bytecode: `0x${compiledMocks.contracts['Mocks.sol'].MockFeeToken.evm.bytecode.object}` };
const nftArt = { abi: compiledMocks.contracts['Mocks.sol'].MockNFT.abi, bytecode: `0x${compiledMocks.contracts['Mocks.sol'].MockNFT.evm.bytecode.object}` };

const acct = (i) => privateKeyToAccount(`0x${String(i).padStart(64, '0')}`);
const OWNER = acct(1);
const FLYWHEEL = acct(2);
const REQUESTER = acct(3);
const EVALUATOR = acct(4);
const WORKER_A = acct(5);
const WORKER_B = acct(6);

const common = createCustomCommon({ chainId: 8453 }, Mainnet, { hardfork: Hardfork.Cancun });
const vm = await createVM({ common });
let now = 1_800_000_000;
const block = () => createBlock({ header: { timestamp: BigInt(now), number: 1n, gasLimit: 60_000_000n } }, { common });
const rawRun = (from, to, data) => vm.evm.runCall({ caller: createAddressFromString(from), to: to ? createAddressFromString(to) : undefined, data: hexToBytes(data), gasLimit: 30_000_000n, block: block() });

async function deploy(art, from, args = []) {
  const res = await rawRun(from.address, null, encodeDeployData({ abi: art.abi, bytecode: art.bytecode, args }));
  if (res.execResult.exceptionError) throw new Error(`deploy failed: ${bytesToHex(res.execResult.returnValue)}`);
  return res.createdAddress.toString();
}
async function send(art, to, from, fn, args = []) {
  const res = await rawRun(from.address, to, encodeFunctionData({ abi: art.abi, functionName: fn, args }));
  if (res.execResult.exceptionError) {
    const ret = bytesToHex(res.execResult.returnValue);
    try { return { error: decodeErrorResult({ abi: art.abi, data: ret }).errorName }; } catch { return { error: `revert ${ret}` }; }
  }
  const events = res.execResult.logs
    .map(([, topics, data]) => { try { return decodeEventLog({ abi: art.abi, topics: topics.map(bytesToHex), data: bytesToHex(data) }); } catch { return null; } })
    .filter(Boolean);
  return { events };
}
async function read(art, to, fn, args = []) {
  const res = await rawRun('0x000000000000000000000000000000000000dEaD', to, encodeFunctionData({ abi: art.abi, functionName: fn, args }));
  if (res.execResult.exceptionError) throw new Error(`read ${fn} failed`);
  return decodeFunctionResult({ abi: art.abi, functionName: fn, data: bytesToHex(res.execResult.returnValue) });
}

const usdc = await deploy(erc20Art, OWNER);
const blockyNft = await deploy(nftArt, OWNER);
const agentReg = await deploy(nftArt, OWNER);
const escrow = await deploy(escrowArt, OWNER, [OWNER.address, FLYWHEEL.address, blockyNft, agentReg, 300]); // 3% fee

// Mint 1,000 USDC (6 dec) to requester and approve escrow
await send(erc20Art, usdc, OWNER, 'mint', [REQUESTER.address, 1_000_000_000n]);
await send(erc20Art, usdc, REQUESTER, 'approve', [escrow, 1_000_000_000n]);
await send(nftArt, blockyNft, OWNER, 'setBal', [WORKER_A.address, 1n]);
await send(nftArt, agentReg, OWNER, 'setBal', [WORKER_B.address, 1n]);

const criteria1 = keccak256(toHex('NVDA nav premium report with live Base data'));
const deliv1 = keccak256(toHex('delivery-1'));
const attest1 = keccak256(toHex('verdict-pass-stock-verifier'));

// 1. Create Bounty task gated to Blocky NFT holders with 100 USDC reward
const r1 = await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 100_000_000n, EVALUATOR.address, BigInt(now + 3600), 0, 1, criteria1]);
assert.equal(r1.error, undefined);
assert.equal(await read(erc20Art, usdc, 'balanceOf', [escrow]), 100_000_000n);

// 2. Non-NFT holder (WORKER_B) fails BlockyNft gate; NFT holder (WORKER_A) succeeds
assert.equal((await send(escrowArt, escrow, WORKER_B, 'submitWork', [1n, deliv1])).error, 'GateFailed');
assert.equal((await send(escrowArt, escrow, WORKER_A, 'submitWork', [1n, deliv1])).error, undefined);

// 3. Requester cannot cancel once submissions exist; non-evaluator cannot complete
assert.equal((await send(escrowArt, escrow, REQUESTER, 'cancelTask', [1n])).error, 'HasSubmissions');
assert.equal((await send(escrowArt, escrow, REQUESTER, 'complete', [1n, WORKER_A.address, attest1])).error, 'NotEvaluator');

// 4. Evaluator completes task -> 97 USDC to WORKER_A, 3 USDC fee to FLYWHEEL
const comp = await send(escrowArt, escrow, EVALUATOR, 'complete', [1n, WORKER_A.address, attest1]);
assert.equal(comp.error, undefined);
assert.equal(await read(erc20Art, usdc, 'balanceOf', [WORKER_A.address]), 97_000_000n);
assert.equal(await read(erc20Art, usdc, 'balanceOf', [FLYWHEEL.address]), 3_000_000n);
assert.equal(await read(erc20Art, usdc, 'balanceOf', [escrow]), 0n);

// 5. Claim-mode task gated to ERC-8004 Agents: WORKER_B claims & submits, WORKER_A blocked, Evaluator rejects -> 100% refund
await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 50_000_000n, EVALUATOR.address, BigInt(now + 3600), 1, 2, criteria1]);
assert.equal((await send(escrowArt, escrow, WORKER_A, 'claimTask', [2n])).error, 'GateFailed');
assert.equal((await send(escrowArt, escrow, WORKER_B, 'claimTask', [2n])).error, undefined);
assert.equal((await send(escrowArt, escrow, WORKER_B, 'submitWork', [2n, deliv1])).error, undefined);
const rej = await send(escrowArt, escrow, EVALUATOR, 'reject', [2n, keccak256(toHex('off-topic'))]);
assert.equal(rej.error, undefined);
assert.equal(await read(erc20Art, usdc, 'balanceOf', [REQUESTER.address]), 900_000_000n);

// 6. Expired task refunds 100% after deadline (and reverts before deadline)
await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 25_000_000n, EVALUATOR.address, BigInt(now + 60), 0, 0, criteria1]);
assert.equal((await send(escrowArt, escrow, WORKER_A, 'refundExpired', [3n])).error, 'TaskNotExpired');
now += 120;
assert.equal((await send(escrowArt, escrow, WORKER_A, 'refundExpired', [3n])).error, undefined);
assert.equal(await read(erc20Art, usdc, 'balanceOf', [REQUESTER.address]), 900_000_000n);

// 7. Cancel task with 0 submissions refunds 100%
await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 10_000_000n, EVALUATOR.address, BigInt(now + 3600), 0, 0, criteria1]);
assert.equal((await send(escrowArt, escrow, REQUESTER, 'cancelTask', [4n])).error, undefined);
assert.equal(await read(erc20Art, usdc, 'balanceOf', [REQUESTER.address]), 900_000_000n);

// ---- v2 rules: protect the people doing the work ----
const DAY = 86400;
const bal = (who) => read(erc20Art, usdc, 'balanceOf', [who]);

// 8. A requester judging their own task: can pick a winner, can NOT reject submitted work, can't submit as a worker
const reqBefore = await bal(REQUESTER.address), aBefore = await bal(WORKER_A.address), flyBefore = await bal(FLYWHEEL.address);
await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 40_000_000n, REQUESTER.address, BigInt(now + 3600), 0, 0, criteria1]); // id 5
assert.equal((await send(escrowArt, escrow, REQUESTER, 'submitWork', [5n, deliv1])).error, 'SelfWorkForbidden');
assert.equal((await send(escrowArt, escrow, WORKER_A, 'submitWork', [5n, deliv1])).error, undefined);
assert.equal((await send(escrowArt, escrow, WORKER_B, 'submitWork', [5n, deliv1])).error, undefined);
assert.equal((await send(escrowArt, escrow, REQUESTER, 'reject', [5n, keccak256(toHex('no thanks'))])).error, 'RequesterCannotReject');
assert.equal((await send(escrowArt, escrow, REQUESTER, 'cancelTask', [5n])).error, 'HasSubmissions');
assert.equal((await send(escrowArt, escrow, REQUESTER, 'complete', [5n, WORKER_B.address, attest1])).error, undefined);
assert.equal(await bal(WORKER_B.address), 38_800_000n);
// 9. Silence: requester judging own task, deadline passes, review window still open -> nothing moves; after it, the FIRST submitter is paid
await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 40_000_000n, REQUESTER.address, BigInt(now + 3600), 0, 0, criteria1]); // id 6
await send(escrowArt, escrow, WORKER_A, 'submitWork', [6n, deliv1]);
await send(escrowArt, escrow, WORKER_B, 'submitWork', [6n, deliv1]);
now += 3600 + 60; // just past the deadline
assert.equal((await send(escrowArt, escrow, REQUESTER, 'refundExpired', [6n])).error, 'HasSubmissions', 'no instant refund when work is in');
assert.equal((await send(escrowArt, escrow, REQUESTER, 'settleDefault', [6n])).error, 'ReviewWindowOpen');
now += 3 * DAY;
assert.equal((await send(escrowArt, escrow, REQUESTER, 'settleDefault', [6n])).error, undefined);
assert.equal(await bal(WORKER_A.address), aBefore + 38_800_000n, 'the first submitter is paid by default');
assert.equal(await bal(FLYWHEEL.address), flyBefore + 2_400_000n, 'the fee still reaches the Flywheel');
// 10. A third-party evaluator that never decides: the requester is refunded, and the evaluator can't be a worker
const reqMid = await bal(REQUESTER.address);
await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 20_000_000n, EVALUATOR.address, BigInt(now + 3600), 0, 0, criteria1]); // id 7
assert.equal((await send(escrowArt, escrow, EVALUATOR, 'submitWork', [7n, deliv1])).error, 'SelfWorkForbidden');
await send(escrowArt, escrow, WORKER_A, 'submitWork', [7n, deliv1]);
now += 3600 + 3 * DAY + 60;
assert.equal((await send(escrowArt, escrow, WORKER_B, 'settleDefault', [7n])).error, undefined);
assert.equal(await bal(REQUESTER.address), reqMid, 'refunded in full (20 locked, 20 back)');
// 11. The fee rate is fixed at creation: raising it later does not touch an open task
const flyMid = await bal(FLYWHEEL.address);
await send(escrowArt, escrow, REQUESTER, 'createTask', [usdc, 100_000_000n, EVALUATOR.address, BigInt(now + 3600), 0, 0, criteria1]); // id 8
assert.equal((await send(escrowArt, escrow, OWNER, 'setFeeBps', [1000])).error, undefined);
await send(escrowArt, escrow, WORKER_A, 'submitWork', [8n, deliv1]);
assert.equal((await send(escrowArt, escrow, EVALUATOR, 'complete', [8n, WORKER_A.address, attest1])).error, undefined);
assert.equal(await bal(FLYWHEEL.address), flyMid + 3_000_000n, 'still 3%, not the new 10%');
// 12. A token that keeps part of every transfer is refused (the contract must receive exactly the amount)
const feeTok = await deploy(feeArt, OWNER);
await send(feeArt, feeTok, OWNER, 'mint', [REQUESTER.address, 1_000_000n]);
await send(feeArt, feeTok, REQUESTER, 'approve', [escrow, 1_000_000n]);
assert.equal((await send(escrowArt, escrow, REQUESTER, 'createTask', [feeTok, 1_000_000n, EVALUATOR.address, BigInt(now + 3600), 0, 0, criteria1])).error, 'TokenTakesFee');

console.log('BaseCityTaskEscrow: all 12 EVM escrow, gate, evaluator, fee and default-settlement checks pass');
