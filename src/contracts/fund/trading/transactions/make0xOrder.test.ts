import * as R from 'ramda';
import { TokenInterface } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';

import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from '~/utils/deploySystem';
import {
  createOrder,
  signOrder,
  fillOrder,
} from '~/contracts/exchanges/thirdparty/0x';

import { make0xOrder } from './make0xOrder';

const shared: any = {};

export const getTokenBySymbol = (tokens: TokenInterface[], symbol: string) =>
  R.find(R.propEq('symbol', symbol), tokens);

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();

  const deployment = await deploySystem();

  shared.settings = await setupInvestedTestFund(deployment);

  shared.zeroExAddress = deployment.exchangeConfigs.find(
    R.propEq('name', 'ZeroEx'),
  ).exchangeAddress;

  shared.mln = getTokenBySymbol(deployment.tokens, 'MLN');
  shared.weth = getTokenBySymbol(deployment.tokens, 'WETH');
});

test('Make 0x order from fund and take it from account', async () => {
  const makerQuantity = createQuantity(shared.weth, 0.05);
  const takerQuantity = createQuantity(shared.mln, 1);

  const unsigned0xOrder = await createOrder(
    shared.zeroExAddress,
    {
      makerAddress: shared.settings.tradingAddress,
      makerQuantity,
      takerQuantity,
    },
    shared.environment,
  );

  const signedOrder = await signOrder(unsigned0xOrder, shared.environment);

  const result = await make0xOrder(
    shared.settings.tradingAddress,
    { signedOrder },
    shared.environment,
  );

  expect(result).toBe(true);

  const filled = await fillOrder(
    shared.zeroExAddress,
    {
      signedOrder,
    },
    shared.environment,
  );

  expect(filled).toBeTruthy();
});