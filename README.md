# Idle contracts For Idle BackStop wrapper

### IdleBackStop.sol Link  
[https://github.com/sunnyRK/BProtocol-yielddapp/blob/master/contracts/wrappers/IdleBackStop.sol](https://github.com/sunnyRK/BProtocol-yielddapp/blob/master/contracts/wrappers/IdleBackStop.sol)

### IdleBackStop.js Testcase Link  
[https://github.com/sunnyRK/BProtocol-yielddapp/blob/master/test/idleBackStop.js](https://github.com/sunnyRK/BProtocol-yielddapp/blob/master/test/idleBackStop.js)

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

3). To run tests first spin up a ganache-cli instance with unlimited contract size flag

    ganache-cli --allowUnlimitedContractSize

4). test

    truffle test
