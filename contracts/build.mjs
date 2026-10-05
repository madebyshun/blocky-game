// Compiles BaseCityBlockies.sol into out/: the artifact (abi + bytecode) the deploy page and the API
// use, and the Standard JSON Input to verify the contract on Basescan.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import solc from 'solc';

const here = new URL('.', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const NAME = 'BaseCityBlockies';
const sources = { [`${NAME}.sol`]: { content: readFileSync(`${here}${NAME}.sol`, 'utf8') } };
const settings = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: 'cancun',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
};
// resolve @openzeppelin/... imports, keeping every source for the verification input
const findImports = (path) => {
  try {
    const content = readFileSync(require.resolve(path), 'utf8');
    sources[path] = { content };
    return { contents: content };
  } catch {
    return { error: `not found: ${path}` };
  }
};
const out = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings }), { import: findImports }));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
for (const e of out.errors || []) console[e.severity === 'error' ? 'error' : 'warn'](e.formattedMessage);
if (errors.length) process.exit(1);

const c = out.contracts[`${NAME}.sol`][NAME];
mkdirSync(`${here}out`, { recursive: true });
const version = `v${solc.version()}`;
writeFileSync(`${here}out/${NAME}.json`, `${JSON.stringify({ contractName: NAME, compiler: version, settings, abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }, null, 1)}\n`);
writeFileSync(`${here}out/${NAME}.input.json`, JSON.stringify({ language: 'Solidity', sources, settings: { ...settings, outputSelection: { '*': { '*': ['*'] } } } }));
console.log(`${NAME}: ${c.evm.deployedBytecode.object.length / 2} bytes deployed, compiler ${version}`);
