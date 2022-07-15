import { KeyStore, Signer, TezosMessageUtils, TezosNodeReader, TezosParameterFormat, TezosConstants, TezosNodeWriter } from 'conseiljs';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';

import { initConseil, loadAccount, SignaturePair, getNextOperationIndex, clearRPCOperationGroupHash } from './util';

export function composeRotateKeysRequest(chainId: string, operationIndex: number, threshold: number, keys: string[]) {
    const encodedChainId = TezosMessageUtils.writeBufferWithHint(chainId, 'chain_id').toString('hex');

    return `{ "prim": "Pair", "args": [ { "bytes": "${encodedChainId}" }, { "prim": "Pair", "args": [ { "int": "${operationIndex}" }, { "prim": "Pair", "args": [ { "int": "${threshold}" }, [ ${keys.map(k => `{ "bytes": "${TezosMessageUtils.writePublicKey(k)}" }`).join(', ')} ] ] } ] } ] }`;
}

export async function sendRotateKeysOperation(node: string, signer: Signer, keyStore: KeyStore, multisigAddress: string, signatures: SignaturePair[], operation: string): Promise<string> {
    const params = `{ "prim": "Pair", "args": [ [ ${signatures.map(s => `{ "prim": "Elt", "args": [ { "string": "${s.address}" }, { "string": "${s.signature}" } ] }`).join(', ')} ], ${operation} ] }`;

    const head = (await TezosNodeReader.getBlockHead(node)).header.level;
    const nodeResult = await TezosNodeWriter.sendContractInvocationOperation(node, signer, keyStore, multisigAddress, 0, 100_000, 500, 500_000, 'rotate', params, TezosParameterFormat.Micheline);
    const groupid = clearRPCOperationGroupHash(nodeResult.operationGroupID);
    await TezosNodeReader.awaitOperationConfirmation(node, head, groupid, 7);

    return groupid;
}

/**
 * 
 * @param node 
 * @param actor 
 * @param multisigAddress 
 * @param signers 
 * @param threshold 
 * @param keys 
 * @param dryrun 
 * @returns 
 */
async function rotateKeys(node: string, actor: {keyStore: KeyStore, signer: Signer}, multisigAddress: string, signers: [{keyStore: KeyStore, signer: Signer}], threshold: number, keys: string[], dryrun: boolean = false) {
    try {
        const nextOperationIndex = await getNextOperationIndex(node, multisigAddress);
        const chainid = await TezosNodeReader.getChainId(node);

        const rotateOperation = composeRotateKeysRequest(chainid, nextOperationIndex, threshold, keys);
        const packedRotateOperation = Buffer.from(TezosMessageUtils.writePackedData(rotateOperation, ''), 'hex');

        const rotateSignatures: SignaturePair[] = await Promise.all(
            signers
                .sort((a, b) => b.keyStore.publicKeyHash > a.keyStore.publicKeyHash ? -1 : 1)
                .map(async (s) => {
                    const signatureBytes = await s.signer.signOperation(packedRotateOperation);
                    const signature = TezosMessageUtils.readSignatureWithHint(signatureBytes, s.signer.getSignerCurve());
                    return { address: s.keyStore.publicKeyHash, signature };
            })
        );

        if (dryrun) {
            return JSON.stringify({
                operation: JSON.parse(rotateOperation),
                signatures: rotateSignatures.map(s => {return {[s.address]: s.signature}})
            });
        } else {
            return sendRotateKeysOperation(node, actor.signer, actor.keyStore, multisigAddress, rotateSignatures, rotateOperation);
        }
    } catch (err: any) {
        return err.toString();
    }
}

async function run(){
    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const signers = await Promise.all(config['accounts'].map(async (a: string) => await loadAccount(path.join('accounts', `${a}.keys`)))) as [{keyStore: KeyStore, signer: Signer}];

    const accountFiles = glob.sync(`accounts/tz1*.keys`).filter(f => !config['accounts'].includes(path.parse(f).name));

    const k = (await Promise.all(accountFiles.map(f => loadAccount(f)))).map(a => a.keyStore);
    let keys = k.map(a => a.publicKey);
    let accounts = k.map(a => a.publicKeyHash);

    if (keys.length <= config['multisig']['threshold']) {
        const accountsPad = await Promise.all(
            config['accounts']
            .slice(0, Number(config['multisig']['threshold']) - keys.length + 2)
            .map(async (a: string) => await loadAccount(path.join('accounts', `${a}.keys`)))) as [{keyStore: KeyStore, signer: Signer}];

        keys = keys.concat(accountsPad.map(a => a.keyStore.publicKey));
        accounts = accounts.concat(accountsPad.map(a => a.keyStore.publicKeyHash));
    }

    await rotateKeys(config['node'], signers[0], config['multisig']['address'], signers, config['multisig']['threshold'], keys);

    config['accounts'] = accounts;
    fs.writeFileSync('config.json', JSON.stringify(config));
}

run();
