import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { DATA_MANIFEST, db } from '../js/core/db.js';
import {
  createEmptyGameState,
  recalculateNetWorth
} from '../js/core/state.js';
import {
  calculateJobAnnualIncome,
  forceInformalSharkLoanToCoverDeficit,
  getCombinedActionMultipliers,
  getElderAnnualAllowance,
  resolveNegativeCashProtocol,
  buyOrInvestInstrument,
  sellOrWithdrawInstrument
} from '../js/engine/economy_engine.js';

const originalLocalStorage = globalThis.localStorage;
const originalDbRaw = db.raw;
const originalDbIsLoaded = db.isLoaded;
const originalIndexEntries = Object.fromEntries(
  Object.entries(db.indexes).map(([key, map]) => [key, new Map(map)])
);
const storage = new Map();

globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const fixtureData = {};
for (const [key, filename] of Object.entries(DATA_MANIFEST)) {
  const filePath = fileURLToPath(new URL(`../data/${filename}`, import.meta.url));
  fixtureData[key] = JSON.parse(await readFile(filePath, 'utf8'));
}

test.beforeEach(() => {
  storage.clear();
  db.raw = structuredClone(fixtureData);
  db.buildIndexes();
  db.isLoaded = true;
});

test.after(() => {
  db.raw = originalDbRaw;
  db.isLoaded = originalDbIsLoaded;

  for (const [key, map] of Object.entries(db.indexes)) {
    map.clear();
    for (const [entryKey, value] of originalIndexEntries[key]) {
      map.set(entryKey, value);
    }
  }

  if (originalLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = originalLocalStorage;
  }
});

function createEconomyState(age = 25) {
  const state = createEmptyGameState();
  state.profile.age = age;
  state.profile.currentLocationId = 'loc_economy_test';
  state.profile.currentClassId = 'class_3';
  state.finance.cash = 10_000;
  state.finance.piggyBank = 0;
  state.finance.investments = {};
  state.finance.ownedAssets = [];
  state.finance.activeLoans = [];
  state.finance.installments = [];
  state.flags = [];
  state.statuses = [];
  state.talentTags = [];
  state.innateTraits = [];
  state.turn.lifeFeedLog = [];
  db.indexes.locations.set('loc_economy_test', {
    location_id: 'loc_economy_test',
    name_th: 'จังหวัดทดสอบ',
    job_opportunity_multiplier: 1.2,
    cost_of_living_multiplier: 1
  });
  return state;
}

test('calculates elder allowance at every age-band boundary', () => {
  assert.equal(getElderAnnualAllowance(59), 0);
  assert.equal(getElderAnnualAllowance(60), 7200);
  assert.equal(getElderAnnualAllowance(69), 7200);
  assert.equal(getElderAnnualAllowance(70), 8400);
  assert.equal(getElderAnnualAllowance(79), 8400);
  assert.equal(getElderAnnualAllowance(80), 9600);
  assert.equal(getElderAnnualAllowance(89), 9600);
  assert.equal(getElderAnnualAllowance(90), 12000);
  assert.equal(getElderAnnualAllowance(100), 12000);
});

test('calculates real job income with location, business, and main-career multipliers', () => {
  const state = createEconomyState();
  state.careerAndEdu.salaryMultiplier = 1.1;
  state.flags = ['test_business_income_bonus'];
  db.indexes.traitsAndFlags.set('test_business_income_bonus', {
    id: 'test_business_income_bonus',
    category_group: 'financial_and_legal_flags',
    action_multipliers: { business_income: 1.5 }
  });

  const job = db.getJob('own_street_food_vendor');
  assert.ok(job, 'the referenced career should exist in the real job database');

  const mainCareerIncome = calculateJobAnnualIncome(
    job, state, getCombinedActionMultipliers(state), true
  );
  const sideCareerIncome = calculateJobAnnualIncome(
    job, state, getCombinedActionMultipliers(state), false
  );

  assert.equal(mainCareerIncome, 475200);
  assert.equal(sideCareerIncome, 432000);
  assert.equal(calculateJobAnnualIncome(null, state, {}, true), 0);
});

test('rejects investment when age, eligibility, minimum amount, or cash requirements fail', () => {
  const state = createEconomyState(6);

  const tooYoung = buyOrInvestInstrument(state, 'inv_gsb_savings', 1000);
  assert.equal(tooYoung.success, false);
  assert.match(tooYoung.message, /อายุอย่างน้อย/);

  state.profile.age = 25;
  const noAccount = buyOrInvestInstrument(state, 'inv_gsb_savings', 1000);
  assert.equal(noAccount.success, false);
  assert.match(noAccount.message, /คุณสมบัติ/);

  state.flags.push('flag_bank_account');
  const belowMinimum = buyOrInvestInstrument(state, 'inv_gsb_savings', 50);
  assert.equal(belowMinimum.success, false);
  assert.match(belowMinimum.message, /ขั้นต่ำ/);

  state.finance.cash = 80;
  const insufficientCash = buyOrInvestInstrument(state, 'inv_gsb_savings', 100);
  assert.equal(insufficientCash.success, false);
  assert.match(insufficientCash.message, /ไม่เพียงพอ/);
  assert.equal(state.finance.cash, 80);
});

test('buys and partially or fully withdraws a real savings instrument without losing net worth', () => {
  const state = createEconomyState();
  state.flags.push('flag_bank_account');
  const initialNetWorth = recalculateNetWorth(state);

  const purchase = buyOrInvestInstrument(state, 'inv_gsb_savings', 1000);
  assert.equal(purchase.success, true);
  assert.equal(state.finance.cash, 9000);
  assert.equal(state.finance.investments.inv_gsb_savings.amountCash, 1000);
  assert.equal(state.finance.investments.inv_gsb_savings.costBasis, 1000);
  assert.equal(state.finance.netWorth, initialNetWorth);

  const partialSale = sellOrWithdrawInstrument(state, 'inv_gsb_savings', 400);
  assert.equal(partialSale.success, true);
  assert.equal(partialSale.soldAmount, 400);
  assert.equal(partialSale.netReceived, 400);
  assert.equal(state.finance.cash, 9400);
  assert.equal(state.finance.investments.inv_gsb_savings.amountCash, 600);
  assert.equal(state.finance.investments.inv_gsb_savings.costBasis, 600);
  assert.equal(state.finance.netWorth, initialNetWorth);

  const fullSale = sellOrWithdrawInstrument(state, 'inv_gsb_savings', 9999);
  assert.equal(fullSale.success, true);
  assert.equal(state.finance.cash, 10000);
  assert.equal(Object.hasOwn(state.finance.investments, 'inv_gsb_savings'), false);
  assert.equal(state.finance.netWorth, initialNetWorth);
});

test('rejects invalid investment withdrawals without mutating the holding', () => {
  const state = createEconomyState();
  state.finance.investments.inv_gsb_savings = { amountCash: 500, costBasis: 500 };

  assert.equal(sellOrWithdrawInstrument(state, 'missing_instrument', 100).success, false);
  assert.equal(sellOrWithdrawInstrument(state, 'inv_gsb_savings', 0).success, false);
  assert.equal(state.finance.investments.inv_gsb_savings.amountCash, 500);
  assert.equal(state.finance.cash, 10000);
});

test('uses available GSB savings to reduce a negative cash balance before offering emergency options', () => {
  const state = createEconomyState();
  state.finance.cash = -500;
  state.finance.investments.inv_gsb_savings = { amountCash: 300, costBasis: 300 };

  const result = resolveNegativeCashProtocol(state);

  assert.equal(result.resolved, false);
  assert.equal(result.deficitAmount, 200);
  assert.equal(state.finance.cash, -200);
  assert.equal(Object.hasOwn(state.finance.investments, 'inv_gsb_savings'), false);
  assert.ok(result.availableOptions.some(
    (option) => option.optionType === 'forced_informal_shark_loan_to_cover_deficit'
  ));
});

test('covers a cash deficit with the forced loan and records the matching debt and status', () => {
  const state = createEconomyState();
  state.finance.cash = -2500;
  const happinessBefore = state.stats.happiness;

  const result = forceInformalSharkLoanToCoverDeficit(state);

  assert.equal(result.success, true);
  assert.equal(result.borrowedAmount, 2500);
  assert.equal(state.finance.cash, 0);
  assert.equal(state.finance.activeLoans.length, 1);
  assert.equal(state.finance.activeLoans[0].loanId, 'loan_informal_loan_shark');
  assert.equal(state.finance.activeLoans[0].principalRemaining, 2500);
  assert.ok(state.flags.includes('flag_informal_shark_debt'));
  assert.equal(state.stats.happiness, happinessBefore - 8);
  assert.equal(state.finance.netWorth, -2500);
});

test('adds a new deficit to an existing informal loan instead of duplicating the loan record', () => {
  const state = createEconomyState();
  state.finance.cash = -700;
  state.finance.activeLoans = [{
    loanId: 'loan_informal_loan_shark',
    principalRemaining: 1300,
    annualRate: 0.6,
    missedYears: 0
  }];

  const result = forceInformalSharkLoanToCoverDeficit(state);

  assert.equal(result.borrowedAmount, 700);
  assert.equal(state.finance.activeLoans.length, 1);
  assert.equal(state.finance.activeLoans[0].principalRemaining, 2000);
  assert.equal(state.finance.cash, 0);
});
