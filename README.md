# Asymetrix Protocol

To run the deployment scripts make sure to update some values before:

- Go to the `hardhat.config.ts` file and update the `defenderRelayer` address
  for one relayer address that you control.
- Once the pervious steps are completed, run the following commands.

### Deploy contracts on Sepolia

```console
npm run deploy:sepolia
```

Do not worry if you see an error message after the deployment, if it says
`FINISHED!` it means that it succeeded.

### Deploy contracts on Goerli

```console
npm run deploy:goerli
```

Do not worry if you see an error message after the deployment, if it says
`FINISHED!` it means that it succeeded.

### Verify the deployed contracts

```console
npm run verify:goerli
```

or

```console
npm run verify:sepolia
```

Do not worry if you see error messages during the verification,those errors
messages show up because the contracts have beed preoviously verified, sometimes
etherscan recognizes that the code is similar to another contract and
automatically verifies them.

The contracts are deployed but now we need to update the code in the autotasks
and the subgraphs if the want to have a full setup. The autotasks will use a
json file with the information of the new contracts, for example the contract
address, abi, name. The file is created with the following command.

### Generate a contracts.json file

```console
npm run generate
```

This command will create a `contracts.json` file in the root folder, this
is the file that needs to be replaced in the autotasks and the subgraphs code
inside autotasks/packages/PACKAGE_NAME/src/contracts/NETWORK/contracts.json
After updating the code in the autotasks repository, run the scripts to update
the autotasks code in defender, or run the scripts locally if it is required.
