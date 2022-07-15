import { KeyStore, Signer } from 'conseiljs';
import * as fs from 'fs';
import * as path from 'path';

import { deployContract, initConseil, loadAccount } from './util';

export async function deployMultisig(tezosNode: string, signer: Signer, keyStore: KeyStore, keys: string[], threshold: number, timelock: number): Promise<string> {
    const storage = `{ "prim": "Pair", "args": [ { "prim": "Pair", "args": [ { "int": "0" }, [ ${keys.map(k => `{ "string": "${k}" }`).join(',')} ] ] }, { "prim": "Pair", "args": [ { "int": "${threshold}" }, { "prim": "Pair", "args": [ [], { "int": "${timelock}" } ] } ] } ] }`;
    const code = fs.readFileSync('contracts/hovermultisig/code.json', 'utf8');

    return deployContract(tezosNode, signer, keyStore, code, storage);
}

async function run() {
    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const account = await loadAccount(path.join('accounts', `${config['accounts'][0]}.keys`));
    const keys = config['accounts'].map((a: string) => JSON.parse(fs.readFileSync(path.join('accounts', `${a}.keys`)).toString())['pk']);

    const address = await deployMultisig(config['node'], account.signer, account.keyStore, keys, config['multisig']['threshold'], config['multisig']['timelock']);

    console.log(`deployed multisig at ${address}`);

    config['multisig']['address'] = address;
    fs.writeFileSync('config.json', JSON.stringify(config));
}

run();
