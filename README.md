# Idle contracts For Idle BackStop wrapper
Live version: [https://idle.finance](https://idle.finance)

### IdleBackStop.sol Link


### Tests

1). Make `.env` file on root folder and add below variable with your config,  

    MAINNET_MNEMONIC=''
    INFURA_KEY=
    IDLE_ALCHEMY_KEY=
    ETHERSCAN_KEY=
    CREATOR=
    REBALANCE_MANAGER=
    FEE_ADDRESS=

2). Install Dependency.

    yarn

To run tests first spin up a ganache-cli instance with unlimited contract size flag
```
ganache-cli --allowUnlimitedContractSize
```

then

```
truffle test
```
