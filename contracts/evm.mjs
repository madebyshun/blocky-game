// A tiny in-memory Base (Cancun, chain id 8453) for the tests: deploy, send, read, decode errors/events.
import { readFileSync } from 'node:fs';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { createAddressFromString, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { createBlock } from '@ethereumjs/block';
import { encodeFunctionData, decodeFunctionResult, decodeErrorResult, encodeDeployData, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const art = JSON.parse(readFileSync(new URL('./out/BaseCityBlockies.json', import.meta.url)));
const { abi } = art;
export const account = (i) => privateKeyToAccount(`0x${String(i).padStart(64, '0')}`);

export async function chain() {
  const common = createCustomCommon({ chainId: 8453 }, Mainnet, { hardfork: Hardfork.Cancun });
  const vm = await createVM({ common });
  const c = { now: 1_800_000_000, address: null };
  const block = () => createBlock({ header: { timestamp: BigInt(c.now), number: 1n, gasLimit: 60_000_000n } }, { common });
  const run = (from, to, data) => vm.evm.runCall({ caller: createAddressFromString(from), to: to ? createAddressFromString(to) : undefined, data: hexToBytes(data), gasLimit: 30_000_000n, block: block() });
  const fail = (res) => {
    const ret = bytesToHex(res.execResult.returnValue);
    try { return decodeErrorResult({ abi, data: ret }).errorName; } catch { return `revert ${ret}`; }
  };
  c.deploy = async (from, args) => {
    const res = await run(from.address, null, encodeDeployData({ abi, bytecode: art.bytecode, args }));
    if (res.execResult.exceptionError) throw new Error(`deploy failed: ${fail(res)}`);
    return (c.address = res.createdAddress.toString());
  };
  c.send = async (from, fn, args = []) => {
    const res = await run(from.address, c.address, encodeFunctionData({ abi, functionName: fn, args }));
    if (res.execResult.exceptionError) return { error: fail(res) };
    const events = res.execResult.logs
      .map(([, topics, data]) => { try { return decodeEventLog({ abi, topics: topics.map(bytesToHex), data: bytesToHex(data) }); } catch { return null; } })
      .filter(Boolean);
    return { events, gas: res.execResult.executionGasUsed };
  };
  c.read = async (fn, args = []) => {
    const res = await run('0x000000000000000000000000000000000000dEaD', c.address, encodeFunctionData({ abi, functionName: fn, args }));
    if (res.execResult.exceptionError) return { error: fail(res) };
    return decodeFunctionResult({ abi, functionName: fn, data: bytesToHex(res.execResult.returnValue) });
  };
  return c;
}
