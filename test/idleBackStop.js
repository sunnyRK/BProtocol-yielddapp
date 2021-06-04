const { expectEvent, singletons, constants, BN, expectRevert } = require('@openzeppelin/test-helpers');

const IdleBackStop = artifacts.require('IdleBackStop');
const WhitePaperMock = artifacts.require('WhitePaperMock');
const cDAIMock = artifacts.require('cDAIMock');
const aDAIMock = artifacts.require('aDAIMock');
const DAIMock = artifacts.require('DAIMock');
const BNify = n => new BN(String(n));

contract('IdleBackStop', function ([_, creator, nonOwner, someone, foo]) {
  beforeEach(async function () {
    this.one = new BN('1000000000000000000');
    this.oneCToken = new BN('100000000'); // 8 decimals
    this.ETHAddr = '0x0000000000000000000000000000000000000000';
    this.someAddr = '0x0000000000000000000000000000000000000001';
    this.someOtherAddr = '0x0000000000000000000000000000000000000002';

    this.DAIMock = await DAIMock.new({from: creator});
    this.WhitePaperMock = await WhitePaperMock.new({from: creator});
    this.bDAIMock = await cDAIMock.new(this.DAIMock.address, creator, this.WhitePaperMock.address, {from: creator});
    this.cDAIMock = await cDAIMock.new(this.DAIMock.address, creator, this.WhitePaperMock.address, {from: creator});
    this.aDAIMock = await aDAIMock.new(this.DAIMock.address, creator, {from: creator});

    this.bProtocolDAIWrapper = await IdleBackStop.new(
      this.bDAIMock.address, // bToken
      this.cDAIMock.address, // cToken
      this.DAIMock.address,
      {from: creator}
    );

    await this.bProtocolDAIWrapper.setIdleToken(nonOwner, {from: creator});
  });

  it('constructor set a token address', async function () {
    (await this.bProtocolDAIWrapper.bTokenDAI()).should.equal(this.bDAIMock.address);
  });
  it('constructor set an underlying address', async function () {
    (await this.bProtocolDAIWrapper.underlyingToken()).should.equal(this.DAIMock.address);
  });
  it('allows onlyOwner to setIdleToken', async function () {
    const val = this.someAddr;
    // it will revert with reason `idleToken addr already set` because it has already been set in beforeEach
    await expectRevert(
      this.bProtocolDAIWrapper.setIdleToken(val, { from: creator }),
      'idleToken addr already set'
    );

    // it will revert with unspecified reason for nonOwner
    await expectRevert.unspecified(this.bProtocolDAIWrapper.setIdleToken(val, { from: nonOwner }));
  });
  it('allows onlyOwner to setBlocksPerYear', async function () {
    const val = BNify('2425846');
    // it will revert with reason `idleToken addr already set` because it has already been set in beforeEach
    await this.bProtocolDAIWrapper.setBlocksPerYear(val, { from: creator });
    (await this.bProtocolDAIWrapper.blocksPerYear()).should.be.bignumber.equal(val);

    // it will revert with unspecified reason for nonOwner
    await expectRevert.unspecified(this.bProtocolDAIWrapper.setBlocksPerYear(val, { from: nonOwner }));
  });

  it('returns next supply rate given amount', async function () {
    const val = [];
    val[0] = BNify('1000000000000000000'), // 10 ** 18;
    val[1] = BNify('50000000000000000'), // white.baseRate();
    val[2] = BNify('23235999897534012338929659'), // cToken.totalBorrows();
    val[3] = BNify('120000000000000000'), // white.multiplier();
    val[4] = BNify('107742405685625342683992'), // cToken.totalReserves();
    val[5] = BNify('950000000000000000'), // j.sub(cToken.reserveFactorMantissa());
    val[6] = BNify('11945633145364637018215366'), // cToken.getCash();
    val[7] = BNify('2398460'), // cToken.blocksPerYear();
    val[8] = BNify('100'), // 100;
    val[9] = BNify('10000000000000000000000') // 10**22 -> 10000 DAI newAmountSupplied;

    // set mock data in bDAIMock
    await this.bDAIMock.setParams(val);
    await this.WhitePaperMock._setSupplyRate(BNify('2').mul(this.one).div(val[7]).div(BNify('100')));

    const nextSupplyInterestRateCompound = await this.bProtocolDAIWrapper.nextSupplyRate.call(BNify('10000000000000000000000'));
    // minor rounding issue due to the calculation of the rate per block for the actual annual rate
    nextSupplyInterestRateCompound.should.be.bignumber.equal(BNify('1999999999785848000'));
  });

  it('returns next supply rate given params (counting fee)', async function () {
    // tested with data and formula from task idleDAI:rebalanceCalc -> targetSupplyRateWithFeeCompound
    const val = [];
    val[0] = BNify('23235999897534012338929659'), // cToken.totalBorrows();
    val[1] = BNify('11945633145364637018215366'), // cToken.getCash();
    val[2] = BNify('107742405685625342683992'), // cToken.totalReserves();
    val[3] = BNify('950000000000000000'), // j.sub(cToken.reserveFactorMantissa());
    val[4] = BNify('2398460'), // cToken.blocksPerYear();
    val[5] = BNify('10000000000000000000000') // 10**22 -> 10000 DAI newAmountSupplied;

    await this.WhitePaperMock._setSupplyRate(BNify('2').mul(this.one).div(val[4]).div(BNify('100')));
    const res = await this.bProtocolDAIWrapper.nextSupplyRateWithParams.call(val, { from: nonOwner });
    // minor rounding issue due to the calculation of the rate per block for the actual annual rate
    res.should.be.bignumber.equal(BNify('1999999999785848000'));
  });

  it('getPriceInToken returns cToken price', async function () {
    const res = await this.bProtocolDAIWrapper.getPriceInToken.call({ from: nonOwner });
    const expectedRes = BNify(await this.bDAIMock.exchangeRateStored.call());
    res.should.be.bignumber.equal(expectedRes);
    res.should.be.bignumber.equal('200000000000000000000000000');
  });

  it('getAPR returns current yearly rate (counting fee)', async function () {
    const res = await this.bProtocolDAIWrapper.getAPR.call({ from: nonOwner });
    const rate = await this.bDAIMock.supplyRatePerBlock.call();
    const blocksPerYear = 2398460;
    const expectedRes = BNify(rate).mul(BNify(blocksPerYear)).mul(BNify('100'));
    res.should.not.be.bignumber.equal(BNify('0'));
    res.should.be.bignumber.equal(expectedRes);
  });

  it('mint returns 0 if no tokens are presenti in this contract', async function () {
    const res = await this.bProtocolDAIWrapper.mint.call({ from: nonOwner });
    res.should.be.bignumber.equal(BNify('0'));
  });

  it('mint creates cTokens and it sends them to msg.sender', async function () {
    // deposit 100 DAI in bProtocolDAIWrapper
    await this.DAIMock.transfer(this.bProtocolDAIWrapper.address, BNify('100').mul(this.one), {from: creator});
    // mints in Compound with 100 DAI
    const callRes = await this.bProtocolDAIWrapper.mint.call({ from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('500000000000'));
    // do the effective tx
    await this.bProtocolDAIWrapper.mint({ from: nonOwner });
    (await this.bDAIMock.balanceOf(nonOwner)).should.be.bignumber.equal(BNify('500000000000'));
  });

  it('redeem creates cTokens and it sends them to msg.sender', async function () {
    // fund cDAIMock with 100 DAI
    await this.DAIMock.transfer(this.bDAIMock.address, BNify('100').mul(this.one), {from: creator});
    // deposit 5000 cDAI in bProtocolDAIWrapper
    await this.bDAIMock.transfer(this.bProtocolDAIWrapper.address, BNify('5000').mul(this.oneCToken), {from: creator});
    // redeem in Compound with 5000 cDAI * 0.02 (price) = 100 DAI
    const callRes = await this.bProtocolDAIWrapper.redeem.call(nonOwner, { from: nonOwner });
    // check return value
    BNify(callRes).should.be.bignumber.equal(BNify('100').mul(this.one));
    // do the effective tx
    await this.bProtocolDAIWrapper.redeem(nonOwner, { from: nonOwner });
    (await this.DAIMock.balanceOf(nonOwner)).should.be.bignumber.equal(BNify('100').mul(this.one));
  });
});
