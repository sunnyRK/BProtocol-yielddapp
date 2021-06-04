/**
 * @title: BackStop DAI wrapper
 * @summary: Used for interacting with Backstop Protocol. Has
 *           a common interface with all other protocol wrappers.
 *           This contract holds assets only during a tx, after tx it should be empty
 * @author: Idle Labs Inc., idle.finance
 */
pragma solidity 0.5.16;
// pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
// import "../interfaces/ILendingProtocol.sol";
import "../interfaces/CERC20.sol";
// import "hardhat/console.sol";

// B.Protocol Token Interface
interface IBErc20 {
    function mint(uint256 mintAmount) external returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function underlying() external view returns (address);
    function cToken() external view returns (address);
    function exchangeRateStored() external view returns (uint256);
}

interface ILendingProtocol {
  function mint() external returns (uint256);
  function redeem(address account) external returns (uint256);
  function nextSupplyRate(uint256 amount) external view returns (uint256);
  function nextSupplyRateWithParams(uint256[] calldata params) external view returns (uint256);
  function getAPR() external view returns (uint256);
  function getPriceInToken() external view returns (uint256);
  function availableLiquidity() external view returns (uint256);
}

// Ctoken InterestRate Model
interface WhitePaperInterestRateModel {
  function getSupplyRate(uint256 cash, uint256 borrows, uint256 reserves, uint256 reserveFactorMantissa) external view returns (uint256);
}

contract IdleBackStop is ILendingProtocol, Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // protocol bTokenDAI (bTokenDAI) address
    address public bTokenDAI;
    address public cToken;

    // underlyingToken bTokenDAI (bTokenDAI eg DAI) address
    address public underlyingToken;
    
    address public idleToken;
    uint256 public blocksPerYear;
    bool public initialized;

    // param _idleToken : idleToken address

    /**
    * @param _token : bTokenDAI address
    * @param _underlying : underlying token (eg DAI) address
    */
    // function initialize(address _token, address _idleToken) public {
    constructor(address _token, address _cToken, address _underlying) public {
        require(!initialized, "Already initialized");
        require(_token != address(0), 'bToken: addr is 0');

        bTokenDAI = _token;
        cToken = _cToken;
        
        underlyingToken = _underlying;
        IERC20(underlyingToken).safeApprove(_token, uint256(-1));
        
        // (1 day = 6570 blocks) => (365 days * 6570 per day blocks = 2398050 total blocks per year)
        blocksPerYear = 2398460;

        initialized = true;
    }

    // onlyOwner
    /**
    * sets idleToken address
    * NOTE: can be called only once. It's not on the constructor because we are deploying this contract
    *       after the IdleToken contract
    * @param _idleToken : idleToken address
    */
    function setIdleToken(address _idleToken)
        external onlyOwner {
        require(idleToken == address(0), "idleToken addr already set");
        require(_idleToken != address(0), "_idleToken addr is 0");
        idleToken = _idleToken;
    }

    /**
   * sets blocksPerYear address
   *
   * @param _blocksPerYear : avg blocks per year
   */
    function setBlocksPerYear(uint256 _blocksPerYear)
        external onlyOwner {
        require(_blocksPerYear != 0, "_blocksPerYear is 0");
        blocksPerYear = _blocksPerYear;
    }

    /**
    * Throws if called by any account other than IdleToken contract.
    */
    modifier onlyIdle() {
        require(msg.sender == idleToken, "Ownable: caller is not IdleToken");
        _;
    }

    /**
    * Calculate next supply rate for Compound, given an `_amount` supplied (last array param)
    * and all other params supplied.
    *
    * @param params : array with all params needed for calculation
    * @return : yearly net rate
    */
    function nextSupplyRateWithParams(uint256[] calldata params)
        external view
        returns (uint256) {
        CERC20 cToken = CERC20(cToken);
        WhitePaperInterestRateModel white = WhitePaperInterestRateModel(cToken.interestRateModel());
        uint256 ratePerBlock = white.getSupplyRate(
            params[1].add(params[5]),
            params[0],
            params[2],
            params[3]
        );
        return ratePerBlock.mul(params[4]).mul(100);
    }

    /**
    * Calculate next supply rate for bTokenDAI, given an `_amount` supplied
    *
    * @param _amount : new underlyingToken amount supplied (eg DAI)
    * @return : yearly net rate
    */
    function nextSupplyRate(uint256 _amount) public view  returns (uint256) {
        uint256 ratePerBlock;
        CERC20 cERC20Token = CERC20(cToken);
        if (_amount > 0) {
            WhitePaperInterestRateModel white = WhitePaperInterestRateModel(cERC20Token.interestRateModel());
            ratePerBlock = white.getSupplyRate(
                cERC20Token.getCash().add(_amount),
                cERC20Token.totalBorrows(),
                cERC20Token.totalReserves(),
                cERC20Token.reserveFactorMantissa()
            );
        } else {
            ratePerBlock = cERC20Token.supplyRatePerBlock();
        }
        return ratePerBlock.mul(blocksPerYear).mul(100);
    }
    
    /**
    * @return current price of bTokenDAI
    */
    function getPriceInToken()
        external view 
        returns (uint256) {
        return IBErc20(bTokenDAI).exchangeRateStored();
    }

    /**
    * @return current apr
    */
    function getAPR()
        external view 
        returns (uint256 apr) {
            CERC20 cERC20Token = CERC20(cToken);
            uint256 cRate = cERC20Token.supplyRatePerBlock(); // interest % per block
            apr = cRate.mul(blocksPerYear).mul(100);
    }
    
    /**
    * Gets all underlyingToken tokens in this contract and mints bTokenDAI Tokens
    * tokens are then transferred to msg.sender
    * NOTE: underlyingToken tokens needs to be sent here before calling this
    *
    * @return bDAITokens Tokens minted
    */
    function mint()
        external onlyIdle 
        returns (uint256 bDAITokens) {
        uint256 balance = IERC20(underlyingToken).balanceOf(address(this));
        if (balance == 0) {
            return bDAITokens;
        }
        // console.log('balance mint: ', balance);
        IBErc20(bTokenDAI).mint(balance);
        bDAITokens = IERC20(bTokenDAI).balanceOf(address(this));
        IERC20(bTokenDAI).safeTransfer(msg.sender, bDAITokens); 
    }

    /**
    * Gets all bTokenDAI in this contract and redeems underlyingToken tokens.
    * underlyingToken tokens are then transferred to `_account`
    * NOTE: bTokenDAI needs to be sent here before calling this
    *
    * @return tokens underlyingToken tokens redeemd
    */
    function redeem(address _account)
        external onlyIdle 
        returns (uint256 tokens) {
        // console.log('IERC20(bTokenDAI).balanceOf(address(this)): ', IERC20(bTokenDAI).balanceOf(address(this)));
        IBErc20(bTokenDAI).redeem(IERC20(bTokenDAI).balanceOf(address(this)));
        IERC20 _underlying = IERC20(underlyingToken);
        tokens = _underlying.balanceOf(address(this));
        _underlying.safeTransfer(_account, tokens);
    }

    /**
    * Get the underlyingToken balance on the lending protocol
    *
    * @return underlyingToken tokens available
    */
    function availableLiquidity() external view returns (uint256) {
        return CERC20(cToken).getCash();
    }
}

