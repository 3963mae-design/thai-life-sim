# Phase B — Trade-off Rebalance Audit

## Purpose

Establish a source-of-truth baseline before changing activity, education, career, or shop balance. Phase A already applies shared diminishing returns to positive core-stat gains and preserves negative effects at full authored strength. This phase evaluates authored trade-offs and how repeated/annual effects behave in the engine.

## Scope inspected

- `data/Education_&_Jobs.json`
- `data/Items_&_Assets_Shop.json`
- `js/engine/economy_engine.js` (`buyShopItem`)
- `js/core/stat_engine.js`

## Findings

### 1. Age-based activities

The activity records already contain meaningful trade-offs for school-age players:

| Activity | Annual cost | Annual effects (selected) | Assessment |
|---|---:|---|---|
| Study hard | 0 THB | Health -1, Happiness -1, Intelligence +4 | Clear study-vs-wellbeing trade-off |
| Cram school | 4,000 THB | Health -2, Happiness -2, Intelligence +7 | Stronger academic gain with higher cost and strain |
| Football club | 0 THB | Health +5, Happiness +3, Intelligence -1, Connections +3 | Distinct physical/social path |
| PC cafe | 1,200 THB | Health -2, Happiness +4, Intelligence +3 | Enjoyment/skill vs health |
| Music/art club | 500 THB | Happiness +4, Intelligence +1, Connections +4 | Social/creative alternative |

Infant care and elder activities are mostly positive by design. They should not receive arbitrary penalties merely to satisfy a numerical trade-off rule.

### 2. Higher education

The eight education programs have differentiated costs and effects. Medicine and IT have stronger Intelligence gains but health/happiness costs; Business and Communication Arts lean toward connections and happiness; Education and vocational study provide more moderate gains.

The records already encode distinct paths. A blanket reduction to all education gains would erase these differences. Tuition and duration should be considered alongside yearly stat effects when balancing total program value.

### 3. Careers and jobs

The job and career records generally include a Health cost, with different benefits by occupation. Examples include:
- Construction daily work: Health -5, Happiness -2.
- Food delivery: Health -3, Happiness -1.
- Software engineering: Health -3, Happiness -1, Intelligence +2.
- Creative marketing: Health -2, Happiness +1, Intelligence +2, Connections +4.
- CEO: Health -4, Happiness +5, Intelligence +3, Connections +8, Appearance +4.

High-end careers have broad positive packages. Phase A diminishing returns reduces marginal stat growth at high stat values, but does not establish that salary, requirements, and yearly effects are balanced against each other. That needs a full income/expense simulation before changing career values.

### 4. Shop purchases and repeatability

The shop data uses `is_one_time_purchase`, `is_resellable_asset`, `price_cash`, and `stat_effects_on_buy`.

Current purchase behavior in `buyShopItem`:
- One-time items are blocked after their item ID is recorded in `purchasedOneTimeItems`.
- Repeatable, non-resellable items generally consume one Free Action Point per purchase (lottery is exempt).
- Resellable assets do not consume that repeat-purchase Action Point.
- `stat_effects_on_buy` is applied on every successful purchase.

This is appropriate for consumables, donations, trips, or recurring services where each purchase represents a separate action. For resellable assets, repeated purchases of the same type can also repeatedly grant immediate stat effects. Diminishing returns softens the gain, but the design should be reviewed so buying multiple copies does not become the dominant stat-progression strategy.

Examples for targeted review:
- Repeatable luxury car, condo, townhome, farmland, and rental-property purchases.
- Repeatable trips, gym membership, annual health checkup, and insurance.
- Repeatable donations and gifts, where Merit or relationship value may be the main reward rather than core stats.

Food/snack purchases currently do not apply a Health penalty per snack. This is intentional to avoid treating one snack as a direct health injury. Long-term dietary habits should be represented by accumulated annual behavior or contextual events, not an automatic Health loss on every purchase.

## Phase B recommendations

1. Keep existing activity trade-offs where records already express a clear choice. Tune outliers only after comparing annual effects, cost, and age.
2. Do not rebalance salaries or career stat packages in isolation. Pair them with annual income, work expenses, prerequisites, and living costs.
3. Preserve the distinction between one-time purchases, consumables, recurring services, and resellable assets. Do not convert all shop items into one-time purchases.
4. Review repeated asset stat rewards as a targeted follow-up. A possible rule is to separate first-acquisition benefit from ownership/portfolio benefit, but implement only with tests that preserve legitimate multi-asset ownership and resale.
5. Represent food and lifestyle risks cumulatively, through annual habit/status systems or contextual events, rather than penalizing each individual low-cost purchase.
6. Use simulation before final numeric tuning. The Phase A diminishing-returns exponent (1.25) and current annual passive cap are provisional balance parameters, not proven optimal values.

## Deliberately not changed in this audit

No gameplay data values or purchase rules are modified by this audit. The inspected records already contain many intentional trade-offs; changing values before measuring full-year outcomes risks creating arbitrary penalties or breaking the economy. This document establishes the baseline and identifies the exact areas for the next implementation pass.
