import * as fs from 'fs';
import * as glob from 'glob';
import { JSONPath } from 'jsonpath-plus';
import * as log from 'loglevel';
import fetch from 'node-fetch';
import * as path from 'path';

import { registerFetch, registerLogger } from 'conseiljs';
import { TezosConstants, TezosNodeWriter, TezosParameterFormat, KeyStore, TezosNodeReader, Signer, TezosMessageUtils } from 'conseiljs';
import { KeyStoreUtils, SoftSigner } from 'conseiljs-softsigner';

export interface SignaturePair {
    address: string;
    signature: string
}

export function initConseil() {
    const logger = log.getLogger('conseiljs');
    logger.setLevel('debug', false);
    registerLogger(logger);
    registerFetch(fetch);
}

export function clearRPCOperationGroupHash(hash: string): string {
    return hash.replace(/\"/g, '').replace(/\n/, '');
}

/**
 * This method is meant to activate multiple faucet accounts that the multisig workflows can be tested with like the ones available from https://teztnets.xyz/ghostnet-faucet.
 */
export async function initAccounts(location: string, node: string, pattern = 'tz1*.json', writeKeys = false, activate = false): Promise<[KeyStore, Signer][]> {
    const accounts: [KeyStore, Signer][] = [];

    const accountFiles: string[] = glob.sync(`${location}/**/${pattern}`);

    for (const f of accountFiles) {
        try {
            const accountInfo = JSON.parse(fs.readFileSync(f, 'utf8'));

            const keyStore = await KeyStoreUtils.restoreIdentityFromFundraiser(
                accountInfo['mnemonic'].join(' '),
                accountInfo['email'],
                accountInfo['password'],
                accountInfo['pkh']);
            const signer = await SoftSigner.createSigner(TezosMessageUtils.writeKeyWithHint(keyStore.secretKey, 'edsk'));

            accounts.push([keyStore, signer]);

            if (writeKeys) {
                fs.writeFileSync(path.join(location, `${accountInfo['pkh']}.keys`), JSON.stringify({ sk: keyStore.secretKey, pk: keyStore.publicKey }));
            }

            if (activate) {
                let nodeResult = await TezosNodeWriter.sendIdentityActivationOperation(node, signer, keyStore, accountInfo['activation_code']);
                let groupid = clearRPCOperationGroupHash(nodeResult.operationGroupID);
                let head = (await TezosNodeReader.getBlockHead(node)).header.level;
                await TezosNodeReader.awaitOperationConfirmation(node, head, groupid, 7);

                nodeResult = await TezosNodeWriter.sendKeyRevealOperation(node, signer, keyStore);
                groupid = clearRPCOperationGroupHash(nodeResult.operationGroupID);
                head = (await TezosNodeReader.getBlockHead(node)).header.level;
                await TezosNodeReader.awaitOperationConfirmation(node, head, groupid, 7);
            }
        } catch (err) {
            //
        }
    }

    return accounts;
}

export async function loadAccount(location: string): Promise<{keyStore: KeyStore, signer: Signer}> {
    const sk = JSON.parse(fs.readFileSync(location).toString())['sk'];

    const keyStore = await KeyStoreUtils.restoreIdentityFromSecretKey(sk);
    const signer = await SoftSigner.createSigner(TezosMessageUtils.writeKeyWithHint(keyStore.secretKey, 'edsk'));

    return { keyStore, signer };
}

export async function deployContract(node: string, signer: Signer, keyStore: KeyStore, code: string, storage: string): Promise<string> {
    const startBlockLevel = (await TezosNodeReader.getBlockHead(node)).header.level;

    const r = await TezosNodeWriter.sendContractOriginationOperation(node, signer, keyStore, 0, undefined, 0, 0, 0, code, storage, TezosParameterFormat.Micheline, TezosConstants.HeadBranchOffset, true);

    const groupid = clearRPCOperationGroupHash(r.operationGroupID);
    const operationResult = await TezosNodeReader.awaitOperationConfirmation(node, startBlockLevel, groupid);
    return operationResult['contents'][0]['metadata']['operation_result']['originated_contracts'][0];
}

export async function submitMultisigOperation(node: string, signatures: any[], operation: string, signer: Signer, keyStore: KeyStore, contractAddress: string): Promise<string> {
    let params = `{ "prim": "Pair", "args": [ [ ${signatures.map(s => `{ "prim": "Elt", "args": [{ "string": "${s.address}" }, { "string": "${s.signature}" }] }`).join(', ')} ], ${operation} ] }`;

    const head = (await TezosNodeReader.getBlockHead(node)).header.level;
    const nodeResult = await TezosNodeWriter.sendContractInvocationOperation(node, signer, keyStore, contractAddress, 0, 100_000, 500, 500_000, 'submit', params, TezosParameterFormat.Micheline);
    const groupid = clearRPCOperationGroupHash(nodeResult.operationGroupID);
    await TezosNodeReader.awaitOperationConfirmation(node, head, groupid, 7);
    return groupid;
}

export async function getNextOperationIndex(node: string, multisigAddress: string): Promise<number> {
    const multisigStorage = await TezosNodeReader.getContractStorage(node, multisigAddress);

    return Number(JSONPath({ path: '$.args[0].args[0].int', json: multisigStorage })[0]) + 1;
}

export async function executeMultisigOperation(node: string, signer: Signer, keyStore: KeyStore, multisigAddress: string, operation: number): Promise<string> {
    const head = (await TezosNodeReader.getBlockHead(node)).header.level;
    const nodeResult = await TezosNodeWriter.sendContractInvocationOperation(node, signer, keyStore, multisigAddress, 0, 100_000, 500, 500_000, 'execute', `${operation}`, TezosParameterFormat.Michelson);
    const groupid = clearRPCOperationGroupHash(nodeResult.operationGroupID);
    await TezosNodeReader.awaitOperationConfirmation(node, head, groupid, 7);
    return groupid;
}
