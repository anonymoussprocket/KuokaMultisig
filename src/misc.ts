import { Tzip7ReferenceTokenHelper, TezosConstants, TezosMessageUtils, TezosNodeReader, TezosNodeWriter, TezosParameterFormat } from 'conseiljs';
import * as fs from 'fs';
import * as path from 'path';

import { initConseil, loadAccount, clearRPCOperationGroupHash, getNextOperationIndex, executeMultisigOperation } from './util';

async function testDeposit() {
    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const account = await loadAccount(path.join('accounts', `${config['accounts'][0]}.keys`));
    const multisigAddress = config['multisig']['address'];

    const startBlockLevel = (await TezosNodeReader.getBlockHead(config['node'])).header.level;

    const r = await TezosNodeWriter.sendTransactionOperation(config['node'], account.signer, account.keyStore, multisigAddress, 100_000_000, 0, TezosConstants.HeadBranchOffset, true);

    const groupid = clearRPCOperationGroupHash(r.operationGroupID);
    const operationResult = await TezosNodeReader.awaitOperationConfirmation(config['node'], startBlockLevel, groupid);
    console.log(operationResult);
}

async function testExecute() {
    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const account = await loadAccount(path.join('accounts', `${config['accounts'][0]}.keys`));
    const multisigAddress = config['multisig']['address'];

    const operationIndex = await getNextOperationIndex(config['node'], config['multisig']['address']) - 1;

    const startBlockLevel = (await TezosNodeReader.getBlockHead(config['node'])).header.level;

    const groupid = await executeMultisigOperation(config['node'], account.signer, account.keyStore, multisigAddress, operationIndex);
    const operationResult = await TezosNodeReader.awaitOperationConfirmation(config['node'], startBlockLevel, groupid);
    console.log(JSON.stringify(operationResult));
}

async function testBareBalanceTransfer() {
    initConseil();

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const account = await loadAccount(path.join('accounts', `${config['accounts'][0]}.keys`));
    const multisigAddress = config['multisig']['address'];

    const startBlockLevel = (await TezosNodeReader.getBlockHead(config['node'])).header.level;

    const r = await TezosNodeWriter.sendContractInvocationOperation(config['node'], account.signer, account.keyStore, multisigAddress, 0, 0, 0, 0, 'transfer', `{ "prim": "Pair", "args": [ { "int": "1000" }, { "bytes": "${TezosMessageUtils.writeAddress(account.keyStore.publicKeyHash)}" } ] }`, TezosParameterFormat.Micheline, TezosConstants.HeadBranchOffset, true);
    const groupid = clearRPCOperationGroupHash(r.operationGroupID);

    const operationResult = await TezosNodeReader.awaitOperationConfirmation(config['node'], startBlockLevel, groupid);
    console.log(JSON.stringify(operationResult));
}

async function setupToken() {
    initConseil();
    let groupid = '';

    const config = JSON.parse(fs.readFileSync('config.json').toString());
    const account = await loadAccount(path.join('accounts', `${config['accounts'][0]}.keys`));

    let startBlockLevel = (await TezosNodeReader.getBlockHead(config['node'])).header.level;
    groupid = await Tzip7ReferenceTokenHelper.deployContract(config['node'], account.signer, account.keyStore, 500_000, account.keyStore.publicKeyHash, false, 0, 150_000, 5000);
    let operationResult = await TezosNodeReader.awaitOperationConfirmation(config['node'], startBlockLevel, groupid);
    const tokenAddress = operationResult['contents'][0]['metadata']['operation_result']['originated_contracts'][0];

    startBlockLevel = (await TezosNodeReader.getBlockHead(config['node'])).header.level;
    groupid = await Tzip7ReferenceTokenHelper.activateLedger(config['node'], account.signer, account.keyStore, tokenAddress, 500_000, 150_000, 1_000,);
    operationResult = await TezosNodeReader.awaitOperationConfirmation(config['node'], startBlockLevel, groupid);

    startBlockLevel = (await TezosNodeReader.getBlockHead(config['node'])).header.level;
    groupid = await Tzip7ReferenceTokenHelper.mint(config['node'], account.signer, account.keyStore, tokenAddress, 500_000, config['multisig']['address'], 100_000, 150_000, 1_000);
    operationResult = await TezosNodeReader.awaitOperationConfirmation(config['node'], startBlockLevel, groupid);
}

testBareBalanceTransfer();
