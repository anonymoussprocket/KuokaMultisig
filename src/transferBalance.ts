import { KeyStore, Signer, TezosMessageUtils, TezosNodeReader } from 'conseiljs';
import * as fs from 'fs';
import * as path from 'path';

import { initConseil, loadAccount, SignaturePair, getNextOperationIndex, submitMultisigOperation } from './util';

export function composeBalanceTransferRequest(chainId: string, operationIndex: number, multisigAddress: string, destinationAddress: string, amount: string | number) {
    const encodedChainId = TezosMessageUtils.writeBufferWithHint(chainId, 'chain_id').toString('hex');

    return `{ "prim": "Pair", "args": [ { "bytes": "${encodedChainId}" }, { "prim": "Pair", "args": [ { "int": "${operationIndex}" }, [ { "prim": "DROP" }, { "prim": "NIL", "args": [ { "prim": "operation" } ] }, { "prim": "PUSH", "args": [ { "prim": "address" }, { "bytes": "${TezosMessageUtils.writeAddress(multisigAddress)}" } ] }, { "prim": "CONTRACT", "args": [ { "prim": "pair", "args": [ { "prim": "mutez" }, { "prim": "address" } ] } ], "annots": [ "%transfer" ] }, { "prim": "IF_NONE", "args": [ [ { "prim": "PUSH", "args": [ { "prim": "int" }, { "int": "3" } ] }, { "prim": "FAILWITH" } ], [] ] }, { "prim": "PUSH", "args": [ { "prim": "mutez" }, { "int": "0" } ] }, { "prim": "PUSH", "args": [ { "prim": "pair", "args": [ { "prim": "mutez" }, { "prim": "address" } ] }, { "prim": "Pair", "args": [ { "int": "${amount}" }, { "bytes": "${TezosMessageUtils.writeAddress(destinationAddress)}" } ] } ] }, { "prim": "TRANSFER_TOKENS" }, { "prim": "CONS" } ] ] } ]}`;
}

async function multisigBalanceTransfer(node: string, actor: {keyStore: KeyStore, signer: Signer}, multisigAddress: string, signers: [{keyStore: KeyStore, signer: Signer}], destinationAddress: string, amount: number | string, dryrun: boolean = false): Promise<string> {
    try {
        const nextOperationIndex = await getNextOperationIndex(node, multisigAddress);
        const chainid = await TezosNodeReader.getChainId(node);

        const transferOperation = composeBalanceTransferRequest(chainid, nextOperationIndex, multisigAddress, destinationAddress, amount);
        const packedTransferOperation = Buffer.from(TezosMessageUtils.writePackedData(transferOperation, ''), 'hex');

        const transferSignatures: SignaturePair[] = await Promise.all(
            signers
                .sort((a, b) => b.keyStore.publicKeyHash > a.keyStore.publicKeyHash ? -1 : 1)
                .map(async (s) => {
                    const signatureBytes = await s.signer.signOperation(packedTransferOperation);
                    const signature = TezosMessageUtils.readSignatureWithHint(signatureBytes, s.signer.getSignerCurve());
                    return { address: s.keyStore.publicKeyHash, signature };
            })
        );

        if (dryrun) {
            return JSON.stringify({
                operation: JSON.parse(transferOperation),
                signatures: transferSignatures.map(s => {return {[s.address]: s.signature}})
            });
        } else {
            return submitMultisigOperation(node, transferSignatures, transferOperation, actor.signer, actor.keyStore, multisigAddress);
        }
    } catch (err: any) {
        return err.toString();
    }
}

async function run(){
    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const signers = await Promise.all(config['accounts'].map(async (a: string) => await loadAccount(path.join('accounts', `${a}.keys`)))) as [{keyStore: KeyStore, signer: Signer}];

    await multisigBalanceTransfer(config['node'], signers[0], config['multisig']['address'], signers, signers[0].keyStore.publicKeyHash, 100_000, false);
}

run();
