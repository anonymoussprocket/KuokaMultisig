# Kuoka Multisig Workflows

## Intro

This project in an implementation of a multisig contract for the [Kuoka Project](https://kuoka.org/) ([@KuokaProject](https://twitter.com/KuokaProject)). It is based on the [HoverLabs](https://twitter.com/HoverEng) [multisig-timelock contract](https://github.com/Hover-Labs/multisig-timelock). Modification were made to add the ability to directly manage an xtz coin balance and to set a delegate.

Other code in this repository contains examples of how this contract can be used in several scenarios. It is using the [ConseilJS](https://www.npmjs.com/package/conseiljs) library from [Cryptonomic](https://github.com/Cryptonomic/ConseilJS). Smart contract is written using [SmartPy](https://smartpy.io/ide).

## Deploy

The code in this repository is not meant to be used in production directly. It is a collection of examples that can be integrated into a user-friend UI for the relevant multisig workflows. The included code can be used to demonstrate the functionality of the contract. To do so, several test accounts need to be created and the the base contract needs to be deployed. Token transfers, both plain (FA1.2) and indexed (FA2) will require a token balance to be assigned to the multisig contract.

To deploy the contract use `npm run deployMultisig`.

## Rotate Keys

Using `npm run rotateKeys`

## Delegate

TBD

## Transfer Balance

Using `npm run transferBalance`

## Transfer Tokens

Using `npm run transferToken`

## Transfer Indexed Tokens

TBD

## Initialize Test Accounts

Test accounts can be created on [teztnets](https://teztnets.xyz/). Several will be needed to run a full test, including at least three for the signers and perhaps more for deployment and contribution testing.

## Configuration Items

`config.json` includes some required parameters. `node` is a Tezos RPC node for blockchain interactions. Currently it's using [Nautilus Cloud](https://nautilus.cloud/) from [Cryptonomic](https://twitter.com/CryptonomicTech). `accounts` is a list of tz1 Tezos accounts which will be interpreted as file names for the `/accounts` directory. tz1---.json is expected to be a faucet file from [teztnets](https://teztnets.xyz/). tz1---.keys is expected to be a JSON file containing two keys, `sk` and `pk`, secret and public key respectively. At a minimum this repo requires three accounts. The `multisig` section contains a `threshold`, which is set to two initially, that is a minimum number of signatures required to execute an operation and `timelock` – a number of seconds to wait before an operation can be executed, for testing it's set to 30 seconds. After a contract is deployed an `address` will be added to this section which the various test scripts in this repo will use to interact with the multisig.

## Quick Start

*This section describes a quick &amp; dirty deployment of a multisig contract. This is not intended to be representative of best practices for key management.*

The following commands will deploy a multisig with two of three signers, the "deployer" and "signer1" accounts and a 30 second time-lock duration. The deployer must have a private key available to sign the deployment transaction. Please take care to secure your private keys.

1. `mkdir KuokaMultisig && cd ./KuokaMultisig`
1. `git clone https://github.com/anonymoussprocket/KuokaMultisig.git .`
1. `npm i`
1. `rm ./accounts/*`
1. `echo "{\"sk\":\"<DEPLOYER_PRIVATE_KEY: edsk...>\",\"pk\":\"<DEPLOYER_PUBLIC_KEY: edpk...>\"}" > ./accounts/deployer.keys`
1. `echo "{\"pk\":\"SIGNER1_PUBLIC_KEY: edpk...\"}" > ./accounts/signer1.keys`
1. `echo "{\"pk\":\"SIGNER1_PUBLIC_KEY: edpk...\"}" > ./accounts/signer2.keys`
1. `rm ./config.json`
1. `echo "{ \"node\": \"https://tezos-prod.cryptonomic-infra.tech\", \"accounts\": [ \"deployer\", \"signer1\", \"signer2\" ], \"multisig\": { \"threshold\": 2, \"timelock\": 30 } }" > ./config.json`

Using the contract deployed above these commands will queue a balance transfer operation. This process is described in [transferBalance.ts](./src/transferBalance.ts#L50). Accordingly, 0.1 XTZ will be transferred to the first signer in the config file, the account described in deployer.keys. Note that for this operation it's necessary to have the private key for the signer account.

1. `echo "{\"sk\":\"<SIGNER1_PRIVATE_KEY: edsk...>\", \"pk\":\"SIGNER1_PUBLIC_KEY: edpk...\"}" > ./accounts/signer1.keys`
1. `npm run transferBalance`
