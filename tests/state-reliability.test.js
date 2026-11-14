import test from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../js/core/db.js';
import {
  CURRENT_GAME_SCHEMA_VERSION,
  createEmptyGameState,
  mergeGameStateWithTemplate,
  migrateGameState,
  recalculateNetWorth,
  getState,
  setState
} from '../js/core/state.js';
import { startNextGenerationAsChild } from '../js/engine/ending_engine.js';

test('migrates a legacy save without schemaVersion to the current schema', () => {
  const legacySave = {
    profile: { age: 24 },
    meta: { runId: 'legacy-run' }
  };

  const migrated = migrateGameState(legacySave);

  assert.equal(migrated.meta.schemaVersion, CURRENT_GAME_SCHEMA_VERSION);
  assert.equal(migrated.meta.runId, 'legacy-run');
  assert.equal(migrated.profile.age, 24);
});

test('does not silently downgrade a save from a newer game version', () => {
  const futureSave = {
    meta: { schemaVersion: '9.0.0' }
  };

  assert.throws(
    () => migrateGameState(futureSave),
    /ไม่รองรับ Save schema version/
  );
});

test('merges missing defaults and normalizes malformed collection fields', () => {
  const oldSave = {
    meta: { schemaVersion: '1.0.0' },
    profile: { age: 35 },
    finance: {
      cash: 1200,
      investments: null,
      ownedAssets: 'not-an-array'
    },
    relationships: {
      children: null
    },
    turn: {
      pendingEvents: {},
      lifeFeedLog: null
    },
    flags: null
  };

  const merged = mergeGameStateWithTemplate(oldSave, createEmptyGameState());

  assert.equal(merged.profile.age, 35);
  assert.equal(merged.finance.cash, 1200);
  assert.deepEqual(merged.finance.investments, {});
  assert.deepEqual(merged.finance.ownedAssets, []);
  assert.deepEqual(merged.relationships.children, []);
  assert.deepEqual(merged.turn.pendingEvents, []);
  assert.deepEqual(merged.turn.lifeFeedLog, []);
  assert.deepEqual(merged.flags, []);
  assert.equal(merged.turn.awaitingEventAdvance, false);
  assert.equal(merged.turn.endingFinalized, false);
});

test('recalculates net worth from cash, savings, investments, assets, and debt', () => {
  const originalClasses = db.indexes.classes;
  db.indexes.classes = new Map([
    ['class_1', { class_id: 'class_1', net_worth_min: -Infinity, net_worth_max: 999 }],
    ['class_2', { class_id: 'class_2', net_worth_min: 1000, net_worth_max: 1999 }]
  ]);

  try {
    const state = createEmptyGameState();
    state.profile.age = 25;
    state.finance.cash = 1000;
    state.finance.piggyBank = 200;
    state.finance.investments = { fund: { amountCash: 500 } };
    state.finance.ownedAssets = [{ currentValue: 300 }];
    state.finance.activeLoans = [{ principalRemaining: 400 }];
    state.finance.installments = [{ annualPayment: 50, yearsRemaining: 2 }];

    assert.equal(recalculateNetWorth(state), 1500);
    assert.equal(state.profile.currentClassId, 'class_2');
  } finally {
    db.indexes.classes = originalClasses;
  }
});

test('starts the selected heir with the correct post-tax inheritance', () => {
  const originalClasses = db.indexes.classes;
  const originalLocations = db.indexes.locations;
  const originalRaw = db.raw;
  const originalState = getState();

  db.indexes.classes = new Map([
    ['class_3', { class_id: 'class_3', name_th: 'ชนชั้นกลาง', net_worth_min: -Infinity, net_worth_max: Infinity }]
  ]);
  db.indexes.locations = new Map();
  db.raw = {
    loansCrisesEndings: {
      ending_archetypes_and_merit_conversion: {
        inheritance_and_next_generation_rules: {
          inheritance_tax_rate_with_will: 0,
          inheritance_tax_rate_without_will: 0.1
        }
      }
    },
    npcs: { child_graduation_and_legacy_outcomes: [] },
    coreRules: {}
  };

  try {
    const previousState = {
      meta: { generationNumber: 1 },
      profile: {
        age: 80,
        currentYearBE: 2568,
        currentLocationId: 'loc_bangkok',
        currentClassId: 'class_3',
        gender: 'male',
        name: 'Parent Example',
        nickname: 'Parent',
        lastName: 'Example'
      },
      stats: { appearance: 55, merit: 20 },
      finance: {
        cash: 100000,
        piggyBank: 0,
        investments: {},
        ownedAssets: [],
        activeLoans: [],
        installments: []
      },
      flags: [],
      statuses: [],
      talentTags: [],
      innateTraits: [],
      relationships: {
        children: [{
          id: 'child-1',
          age: 18,
          gender: 'female',
          firstName: 'Example',
          lastName: 'Family',
          nickname: 'Amy',
          shortName: 'Amy',
          relationship: 80,
          successPoints: 0
        }],
        designatedHeirId: 'child-1',
        partner: null,
        npcs: []
      },
      careerAndEdu: {},
      turn: {
        endingFinalized: true,
        phase: 'ENDED',
        lifeFeedLog: []
      }
    };

    const result = startNextGenerationAsChild(previousState, 'child-1');

    assert.equal(result.success, true);
    assert.equal(result.generationNumber, 2);
    assert.equal(result.taxDeducted, 10000);
    assert.equal(result.inheritedCash, 90000);
    assert.equal(result.newState.profile.age, 18);
    assert.equal(result.newState.finance.cash, 90000);
  } finally {
    db.indexes.classes = originalClasses;
    db.indexes.locations = originalLocations;
    db.raw = originalRaw;
    setState(originalState);
  }
});
