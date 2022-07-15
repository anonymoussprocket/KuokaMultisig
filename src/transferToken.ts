import { KeyStore, Signer, TezosMessageUtils, TezosNodeReader } from 'conseiljs';
import * as fs from 'fs';
import * as path from 'path';

import { initConseil, loadAccount, SignaturePair, getNextOperationIndex, submitMultisigOperation } from './util';

export function composeTokenTransferRequest(chainId: string, operationIndex: number, tokenContractAddress: string, sourceAddress: string, destinationAddress: string, tokenBalance: string | number) {
    const encodedChainId = TezosMessageUtils.writeBufferWithHint(chainId, 'chain_id').toString('hex');

    return `{ "prim": "Pair", "args": [ { "bytes": "${encodedChainId}" }, { "prim": "Pair", "args": [ { "int": "${operationIndex}" }, [ { "prim": "DROP" }, { "prim": "NIL", "args": [ { "prim": "operation" } ] }, { "prim": "PUSH", "args": [ { "prim": "address" }, { "bytes": "${TezosMessageUtils.writeAddress(tokenContractAddress)}" } ] }, { "prim": "CONTRACT", "args": [ { "prim": "pair", "args": [ { "prim": "address" }, { "prim": "pair", "args": [ { "prim": "address" }, { "prim": "nat" } ] } ] } ], "annots": [ "%transfer" ] }, { "prim": "IF_NONE", "args": [ [ { "prim": "PUSH", "args": [ { "prim": "int" }, { "int": "3" } ] }, { "prim": "FAILWITH" } ], [] ] }, { "prim": "PUSH", "args": [ { "prim": "mutez" }, { "int": "0" } ] }, { "prim": "PUSH", "args": [ { "prim": "pair", "args": [ { "prim": "address" }, { "prim": "pair", "args": [ { "prim": "address" }, { "prim": "nat" } ] } ] }, { "prim": "Pair", "args": [ { "bytes": "${TezosMessageUtils.writeAddress(sourceAddress)}" }, { "prim": "Pair", "args": [ { "bytes": "${TezosMessageUtils.writeAddress(destinationAddress)}" }, { "int": "${tokenBalance}" } ] } ] } ] }, { "prim": "TRANSFER_TOKENS" }, { "prim": "CONS" } ] ] } ] }`;
}

async function multisigTokenTransfer(node: string, actor: {keyStore: KeyStore, signer: Signer}, multisigAddress: string, signers: [{keyStore: KeyStore, signer: Signer}], tokenContractAddress: string, destinationAddress: string, tokenBalance: number | string, dryrun: boolean = false): Promise<string> {
    try {
        const nextOperationIndex = await getNextOperationIndex(node, multisigAddress);
        const chainid = await TezosNodeReader.getChainId(node);

        const transferOperation = composeTokenTransferRequest(chainid, nextOperationIndex, tokenContractAddress,multisigAddress, destinationAddress, tokenBalance);
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
            return JSON.stringify( {
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

async function run() {
    const tokenAddress = 'KT1WzihVDSq7eFj9RikRZ5vbP5YX827u1pfw';

    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const signers = await Promise.all(config['accounts'].map(async (a: string) => await loadAccount(path.join('accounts', `${a}.keys`)))) as [{keyStore: KeyStore, signer: Signer}];

    await multisigTokenTransfer(config['node'], signers[0], config['multisig']['address'], signers, tokenAddress, signers[0].keyStore.publicKeyHash, 10, false);
}

run();
