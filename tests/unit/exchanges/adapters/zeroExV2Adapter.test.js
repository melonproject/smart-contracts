/*
 * @file Unit tests for vault via the ZeroExV2Adapter
 *
 * @test takeOrder: __validateTakeOrderParams
 * @test takeOrder: Order 1: full amount
 * @test takeOrder: Order 2: full amount w/ takerFee
 * @test takeOrder: Order 3: partial amount w/ takerFee
 */

import { BN, toWei, randomHex } from 'web3-utils';
import { call, send } from '~/deploy/utils/deploy-contract';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import { investInFund, setupFundWithParams } from '~/tests/utils/fund';
import {
  getEventCountFromLogs,
  getEventFromLogs,
  getFunctionSignature
} from '~/tests/utils/metadata';
import {
  createUnsignedZeroExOrder,
  encodeZeroExTakeOrderArgs,
  isValidZeroExSignatureOffChain,
  signZeroExOrder
} from '~/tests/utils/zeroExV2';
import { getDeployed } from '~/tests/utils/getDeployed';
import * as mainnetAddrs from '~/mainnet_thirdparty_contracts';

let web3;
let deployer, manager, investor;
let defaultTxOpts, managerTxOpts;
let mln, zrx, weth;
let priceSource;
let erc20Proxy, zeroExAdapter, zeroExExchange;
let fund, fundFactory;
let takeOrderSignature;
let zrxToWethRate;

beforeAll(async () => {
  web3 = await startChain();
  [deployer, manager, investor] = await web3.eth.getAccounts();
  defaultTxOpts = { from: deployer, gas: 8000000 };
  managerTxOpts = { from: manager, gas: 8000000 };

  takeOrderSignature = getFunctionSignature(
    CONTRACT_NAMES.ORDER_TAKER,
    'takeOrder',
  );

  mln = getDeployed(CONTRACT_NAMES.MLN, web3, mainnetAddrs.tokens.MLN);
  weth = getDeployed(CONTRACT_NAMES.WETH, web3, mainnetAddrs.tokens.WETH);
  zrx = getDeployed(CONTRACT_NAMES.ZRX, web3, mainnetAddrs.tokens.ZRX);
  priceSource = getDeployed(CONTRACT_NAMES.KYBER_PRICEFEED, web3);
  erc20Proxy = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ERC20_PROXY, web3, mainnetAddrs.zeroExV2.ZeroExV2ERC20Proxy);
  zeroExAdapter = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_ADAPTER, web3);
  zeroExExchange = getDeployed(CONTRACT_NAMES.ZERO_EX_V2_EXCHANGE, web3, mainnetAddrs.zeroExV2.ZeroExV2Exchange);
  fundFactory = getDeployed(CONTRACT_NAMES.FUND_FACTORY, web3);
  zrxToWethRate = await call(priceSource, 'getPrice', [zrx.options.address]);
});

describe('takeOrder', () => {
  // @dev Only need to run this once
  describe('__validateTakeOrderParams', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        integrationAdapters: [zeroExAdapter.options.address],
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
        },
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts,
        web3
      );
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );

      expect(signatureValid).toBeTruthy();
    });

    it('does not allow taker fill amount greater than order max', async () => {
      const { vault } = fund;
      const badFillQuantity = new BN(fillQuantity).add(new BN(1)).toString();

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, badFillQuantity);

      await expect(
        send(
          vault,
          'callOnIntegration',
          [
            zeroExAdapter.options.address,
            takeOrderSignature,
            encodedArgs,
          ],
          managerTxOpts,
          web3
        )
      ).rejects.toThrowFlexible('taker fill amount greater than max order quantity');
    });
  });

  describe('Fill Order 1: no fees', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity;
    let preFundHoldingsMln, preFundHoldingsWeth, postFundHoldingsMln, postFundHoldingsWeth;
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
        },
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts,
        web3
      );
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts,
        web3
      );

      postFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.targetContract).toBe(zeroExExchange.options.address);
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(0);
      expect(orderFilled.feeAmounts.length).toBe(0);
    });
  });

  describe('Fill Order 2: w/ taker fee', () => {
    let signedOrder;
    let makerTokenAddress, takerTokenAddress, fillQuantity, takerFee;
    let preFundHoldingsMln, postFundHoldingsMln;
    let preFundHoldingsWeth, postFundHoldingsWeth;
    let preFundHoldingsZrx, postFundHoldingsZrx;
    let tx;

    beforeAll(async () => {
      fund = await setupFundWithParams({
        defaultTokens: [mln.options.address, weth.options.address],
        integrationAdapters: [zeroExAdapter.options.address],
        initialInvestment: {
          contribAmount: toWei('1', 'ether'),
          investor,
          tokenContract: weth
        },
        quoteToken: weth.options.address,
        fundFactory,
        manager,
        web3
      });

      // Make 2nd investment with ZRX to allow taker fee trade
      takerFee = toWei('0.0001', 'ether');
      const contribAmount = toWei('1', 'ether');

      await send(
        fund.shares,
        'enableSharesInvestmentAssets',
        [[zrx.options.address]],
        managerTxOpts,
        web3
      );
      await investInFund({
        fundAddress: fund.hub.options.address,
        investment: {
          contribAmount,
          investor,
          tokenContract: zrx
        },
        tokenPriceData: {
          priceSource,
          tokenAddresses: [ zrx.options.address ],
          tokenPrices: [ zrxToWethRate ]
        },
        web3
      });
    });

    test('third party makes and validates an off-chain order', async () => {
      const makerAddress = deployer;
      const makerAssetAmount = toWei('1', 'Ether');
      const takerAssetAmount = toWei('0.05', 'Ether');
      makerTokenAddress = mln.options.address;
      takerTokenAddress = weth.options.address;
      fillQuantity = takerAssetAmount;

      const unsignedOrder = await createUnsignedZeroExOrder(
        zeroExExchange.options.address,
        {
          feeRecipientAddress: investor,
          makerAddress,
          makerTokenAddress,
          makerAssetAmount,
          takerTokenAddress,
          takerAssetAmount,
          takerFee,
        },
      );

      await send(
        mln,
        'approve',
        [erc20Proxy.options.address, makerAssetAmount],
        defaultTxOpts,
        web3
      );
      signedOrder = await signZeroExOrder(unsignedOrder, deployer);
      const signatureValid = await isValidZeroExSignatureOffChain(
        unsignedOrder,
        signedOrder.signature,
        deployer
      );

      expect(signatureValid).toBeTruthy();
    });

    test('order is filled through the fund', async () => {
      const { vault } = fund;

      preFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      preFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
      preFundHoldingsZrx = new BN(
        await call(vault, 'assetBalances', [zrx.options.address])
      );

      const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, fillQuantity);

      tx = await send(
        vault,
        'callOnIntegration',
        [
          zeroExAdapter.options.address,
          takeOrderSignature,
          encodedArgs,
        ],
        managerTxOpts,
        web3
      );

      postFundHoldingsWeth = new BN(
        await call(vault, 'assetBalances', [weth.options.address])
      );
      postFundHoldingsMln = new BN(
        await call(vault, 'assetBalances', [mln.options.address])
      );
      postFundHoldingsZrx = new BN(
        await call(vault, 'assetBalances', [zrx.options.address])
      );
    });

    it('correctly updates fund holdings', async () => {
      expect(postFundHoldingsWeth).bigNumberEq(
        preFundHoldingsWeth.sub(new BN(signedOrder.takerAssetAmount))
      );
      expect(postFundHoldingsMln).bigNumberEq(
        preFundHoldingsMln.add(new BN(signedOrder.makerAssetAmount))
      );
      expect(postFundHoldingsZrx).bigNumberEq(
        preFundHoldingsZrx.sub(new BN(signedOrder.takerFee))
      );
    });

    it('emits correct OrderFilled event', async () => {
      const orderFilledCount = getEventCountFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilledCount).toBe(1);

      const orderFilled = getEventFromLogs(
        tx.logs,
        CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
        'OrderFilled'
      );
      expect(orderFilled.targetContract).toBe(zeroExExchange.options.address);
      expect(orderFilled.buyAsset).toBe(makerTokenAddress);
      expect(orderFilled.buyAmount).toBe(signedOrder.makerAssetAmount);
      expect(orderFilled.sellAsset).toBe(takerTokenAddress);
      expect(orderFilled.sellAmount).toBe(signedOrder.takerAssetAmount);
      expect(orderFilled.feeAssets.length).toBe(1);
      expect(orderFilled.feeAssets[0]).toBe(zrx.options.address);
      expect(orderFilled.feeAmounts.length).toBe(1);
      expect(orderFilled.feeAmounts[0]).toBe(signedOrder.takerFee);
    });
  });

  // describe('Fill Order 3: partial fill w/ taker fee', () => {
  //   let signedOrder;
  //   let makerTokenAddress, takerTokenAddress, takerFee;
  //   let makerFillQuantity, takerFillQuantity, takerFeeFillQuantity;
  //   let preFundHoldingsMln, postFundHoldingsMln;
  //   let preFundHoldingsWeth, postFundHoldingsWeth;
  //   let preFundHoldingsZrx, postFundHoldingsZrx;
  //   let tx;

  //   beforeAll(async () => {
  //     fund = await setupFundWithParams({
  //       defaultTokens: [mln.options.address, weth.options.address],
  //       integrationAdapters: [zeroExAdapter.options.address],
  //       initialInvestment: {
  //         contribAmount: toWei('1', 'ether'),
  //         investor,
  //         tokenContract: weth
  //       },
  //       quoteToken: weth.options.address,
  //       fundFactory,
  //       manager,
  //       web3
  //     });

  //     // Make 2nd investment with ZRX to allow taker fee trade
  //     takerFee = toWei('0.0001', 'ether');
  //     await send(
  //       fund.shares,
  //       'enableSharesInvestmentAssets',
  //       [[zrx.options.address]],
  //       defaultTxOpts,
  //       web3
  //     );
  //     await investInFund({
  //       fundAddress: fund.hub.options.address,
  //       investment: {
  //         contribAmount: takerFee,
  //         investor,
  //         tokenContract: zrx
  //       },
  //       tokenPriceData: {
  //         priceSource,
  //         tokenAddresses: [
  //           zrx.options.address
  //         ]
  //       }
  //     });
  //   });

  //   test('third party makes and validates an off-chain order', async () => {
  //     const makerAddress = deployer;
  //     const makerAssetAmount = toWei('1', 'Ether');
  //     const takerAssetAmount = toWei('0.05', 'Ether');
  //     makerTokenAddress = mln.options.address;
  //     takerTokenAddress = weth.options.address;

  //     const unsignedOrder = await createUnsignedZeroExOrder(
  //       zeroExExchange.options.address,
  //       {
  //         makerAddress,
  //         makerTokenAddress,
  //         makerAssetAmount,
  //         takerTokenAddress,
  //         takerAssetAmount,
  //         takerFee,
  //         feeRecipientAddress: randomHex(20),
  //       },
  //     );

  //     await send(
  //       mln,
  //       'approve',
  //       [erc20Proxy.options.address, makerAssetAmount],
  //       defaultTxOpts,
  //       web3
  //     );
  //     signedOrder = await signZeroExOrder(unsignedOrder, deployer);
  //     const signatureValid = await isValidZeroExSignatureOffChain(
  //       unsignedOrder,
  //       signedOrder.signature,
  //       deployer
  //     );

  //     expect(signatureValid).toBeTruthy();
  //   });

  //   test('half of the order is filled through the fund', async () => {
  //     const { vault } = fund;
  //     const partialFillDivisor = new BN(2);
  //     takerFillQuantity = new BN(signedOrder.takerAssetAmount).div(partialFillDivisor);
  //     makerFillQuantity = new BN(signedOrder.makerAssetAmount).div(partialFillDivisor);
  //     takerFeeFillQuantity = new BN(signedOrder.takerFee).div(partialFillDivisor);

  //     preFundHoldingsWeth = new BN(
  //       await call(vault, 'assetBalances', [weth.options.address])
  //     );
  //     preFundHoldingsMln = new BN(
  //       await call(vault, 'assetBalances', [mln.options.address])
  //     );
  //     preFundHoldingsZrx = new BN(
  //       await call(vault, 'assetBalances', [zrx.options.address])
  //     );

  //     const encodedArgs = encodeZeroExTakeOrderArgs(signedOrder, takerFillQuantity.toString());

  //     tx = await send(
  //       vault,
  //       'callOnIntegration',
  //       [
  //         zeroExAdapter.options.address,
  //         takeOrderSignature,
  //         encodedArgs,
  //       ],
  //       managerTxOpts,
  //       web3
  //     );

  //     postFundHoldingsWeth = new BN(
  //       await call(vault, 'assetBalances', [weth.options.address])
  //     );
  //     postFundHoldingsMln = new BN(
  //       await call(vault, 'assetBalances', [mln.options.address])
  //     );
  //     postFundHoldingsZrx = new BN(
  //       await call(vault, 'assetBalances', [zrx.options.address])
  //     );
  //   });

  //   it('correctly updates fund holdings', async () => {
  //     expect(postFundHoldingsWeth).bigNumberEq(preFundHoldingsWeth.sub(takerFillQuantity));
  //     expect(postFundHoldingsMln).bigNumberEq(preFundHoldingsMln.add(makerFillQuantity));
  //     expect(postFundHoldingsZrx).bigNumberEq(preFundHoldingsZrx.sub(takerFeeFillQuantity));
  //   });

  //   it('emits correct OrderFilled event', async () => {
  //     const orderFilledCount = getEventCountFromLogs(
  //       tx.logs,
  //       CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
  //       'OrderFilled'
  //     );
  //     expect(orderFilledCount).toBe(1);

  //     const orderFilled = getEventFromLogs(
  //       tx.logs,
  //       CONTRACT_NAMES.ZERO_EX_V2_ADAPTER,
  //       'OrderFilled'
  //     );
  //     expect(orderFilled.targetContract).toBe(zeroExExchange.options.address);
  //     expect(orderFilled.buyAsset).toBe(makerTokenAddress);
  //     expect(new BN(orderFilled.buyAmount)).bigNumberEq(makerFillQuantity);
  //     expect(orderFilled.sellAsset).toBe(takerTokenAddress);
  //     expect(new BN(orderFilled.sellAmount)).bigNumberEq(takerFillQuantity);
  //     expect(orderFilled.feeAssets.length).toBe(1);
  //     expect(orderFilled.feeAssets[0]).toBe(zrx.options.address);
  //     expect(orderFilled.feeAmounts.length).toBe(1);
  //     expect(new BN(orderFilled.feeAmounts[0])).bigNumberEq(takerFeeFillQuantity);
  //   });
  // });
});
