/**
 * js/core/state.js
 * โครงสร้าง GameState, การสุ่มกำเนิดตัวละครแรกเกิด (อายุ 0 ขวบ) และระบบ Save/Load ผ่าน localStorage
 */

import { db } from './db.js';
import { clampStat, pickRandom, randomInt, weightedRandom } from './utils.js';

export const SAVE_STORAGE_KEY = 'thai_life_sim_save_v1';
export const META_STORAGE_KEY = 'thai_life_sim_meta_v1';
export const MAX_FREE_ACTION_POINTS = 3;

let currentState = null;

/**
 * โครงสร้างข้อมูลข้ามภพชาติ (Meta Progression สำหรับแต้มบุญสะสมและสถิติการเกิดใหม่)
 */
export function createDefaultMetaState() {
  return {
    version: '1.0.0',
    karmaBankMerit: 0,
    totalLivesPlayed: 0,
    unlockedEndings: [],
    hallOfFame: []
  };
}

/**
 * โหลดข้อมูล Meta ข้ามภพชาติจาก localStorage
 */
export function loadMetaState() {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return createDefaultMetaState();
    return { ...createDefaultMetaState(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn('[State] ไม่สามารถอ่าน MetaState จาก localStorage ได้:', err);
    return createDefaultMetaState();
  }
}

/**
 * บันทึกข้อมูล Meta ข้ามภพชาติลง localStorage
 */
export function saveMetaState(metaState) {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(metaState));
    return true;
  } catch (err) {
    console.error('[State] บันทึก MetaState ล้มเหลว:', err);
    return false;
  }
}

/**
 * สุ่มชื่อ-นามสกุล-ชื่อเล่นภาษาไทยตามเพศและชนชั้นจากไฟล์ NPC_&_Relationships.json
 * @param {'male'|'female'} gender
 * @param {string} classId
 * @param {'player'|'parent'} [generation='player']
 */
export function generateThaiIdentity(gender, classId, generation = 'player') {
  const pools = db.getThaiNamePools();
  if (!pools) {
    return {
      firstName: gender === 'female' ? 'วันเพ็ญ' : 'สมชาย',
      lastName: 'ใจดี',
      nickname: gender === 'female' ? 'พลอย' : 'บอส',
      fullName: gender === 'female' ? 'ด.ญ. วันเพ็ญ ใจดี (พลอย)' : 'ด.ช. สมชาย ใจดี (บอส)'
    };
  }

  const isEliteOrRich = classId === 'class_4' || classId === 'class_5';
  const isPoor = classId === 'class_1' || classId === 'class_2';

  // เลือกคลังชื่อเล่น
  let nickPool = pools.nicknames_millennial_genz;
  if (generation === 'parent') {
    nickPool = pools.nicknames_boomer_genx;
  } else if (isEliteOrRich) {
    nickPool = pools.nicknames_hisoclass_gen_alpha;
  }

  // เลือกคลังชื่อจริง
  let firstPool;
  if (generation === 'parent' || (isPoor && randomInt(1, 100) <= 45)) {
    firstPool = gender === 'female'
      ? pools.first_names_female_traditional
      : pools.first_names_male_traditional;
  } else {
    firstPool = gender === 'female'
      ? pools.first_names_female_modern
      : pools.first_names_male_modern;
  }

  // เลือกคลังนามสกุลตามชนชั้น
  let lastPool = pools.last_names_by_class?.class_3_4_urban || ['วงศ์สว่าง'];
  if (classId === 'class_5') {
    lastPool = pools.last_names_by_class?.class_5_elite || lastPool;
  } else if (isPoor) {
    lastPool = pools.last_names_by_class?.class_1_2_rural || lastPool;
  }

  const firstName = pickRandom(firstPool) || 'ณภัทร';
  const lastName = pickRandom(lastPool) || 'เจริญกิจ';
  const nickname = pickRandom(nickPool) || 'ต้น';

  return {
    firstName,
    lastName,
    nickname,
    fullName: `${firstName} ${lastName}`
  };
}

/**
 * สร้างโครงสร้าง GameState เปล่าตามสคีมาหลักของเกม
 */
export function createEmptyGameState() {
  return {
    meta: {
      schemaVersion: '1.1.0',
      runId: `run_${Date.now()}_${randomInt(1000, 9999)}`,
      generationNumber: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },

    profile: {
      name: '',
      firstName: '',
      lastName: '',
      nickname: '',
      gender: 'male', // 'male' | 'female'
      titlePrefix: 'ด.ช.',
      age: 0,
      birthYearBE: 2568,
      currentYearBE: 2568,
      lifePhaseId: 'phase_1_infant',
      spawnClassId: 'class_3',
      currentClassId: 'class_3',
      birthLocationId: 'loc_bangkok',
      currentLocationId: 'loc_bangkok',
      isAlive: true,
      deathCauseId: null
    },

    // ค่าสถานะหลัก 4 หลอด + ค่าพิเศษ 2 ตัว (merit, appearance)
    stats: {
      health: 70,
      happiness: 70,
      intelligence: 50,
      connections: 50,
      merit: 0,
      appearance: 50
    },

    // ตัวนับสำหรับเงื่อนไขพิเศษข้ามปี (เช่น happiness == 0 ติดกัน 2 ปีติดซึมเศร้า)
    statCounters: {
      zeroHappinessStreakYears: 0,
      onTimeLoanPaymentStreakYears: 0,
      blacklistClearedCountdownYears: 0,
      lastMotherAidAge: -99
    },

    // ระบบการเงิน กระปุกออมสิน พอร์ตการลงทุน สินทรัพย์ และหนี้สิน
    finance: {
      cash: 0,                     // เงินสดในมือ (เปิดใช้เต็มตัวหลังทุบกระปุกอายุ 7 ปี)
      piggyBank: 0,                // กระปุกออมสินวัยเด็ก (อายุ 0 - 6 ปี)
      hasPiggyBankSmashed: false,  // ทุบกระปุกตอนอายุ 7 ปีหรือยัง
      netWorth: 0,                 // ความมั่งคั่งสุทธิ
      parentAnnualSupport: 0,      // เงินซัพพอร์ตจากพ่อแม่ (อายุ 0 - 17 ปี)
      baseAnnualLivingCost: 0,     // ค่าครองชีพพื้นฐานตามช่วงวัย
      investments: {},             // { [instrument_id]: { amountCash: 0, costBasis: 0 } }
      ownedAssets: [],             // รายการของที่ซื้อและขายต่อได้ [{ instanceId, itemId, currentValue, purchaseAge }]
      purchasedOneTimeItems: [],   // item_id ที่ซื้อได้ครั้งเดียวในชีวิต
      installments: [],            // รายการผ่อนสินค้า/บ้าน/รถ [{ itemId, annualPayment, yearsRemaining }]
      activeLoans: [],             // สินเชื่อคงค้าง [{ loanId, principalRemaining, annualRate, missedYears }]
      currentMarketNewsId: null,   // ข่าวตลาดประจำปีปัจจุบัน
      lastAnnualSlip: null         // สรุปงบการเงินข้ามปีล่าสุดสำหรับแสดง Modal สลิป
    },

    // ระบบการเรียน กิจกรรมตามวัย อาชีพ (กฎเหล็กถืออาชีพหลัก 1 อาชีพ) และใบอนุญาต
    careerAndEdu: {
      currentActivityId: 'act_infant_nap', // กิจกรรมพัฒนาการตามวัย (วัยเด็ก/วัยชรา)
      activeStudy: null,                   // { programId, yearsCompleted, durationYears, annualTuition, useStudentLoan }
      completedDegrees: [],
      mainJobId: null,                     // อาชีพหลัก (ถือได้ทีละ 1 อาชีพเท่านั้น)
      partTimeJobId: null,                 // อาชีพเสริม/พาร์ทไทม์ (ทำควบได้ขณะกำลังเรียน)
      yearsInMainJob: 0,
      salaryMultiplier: 1.0,               // ตัวคูณฐานเงินเดือนจากการขอขึ้นเงินเดือน/เลื่อนขั้น
      otUsedThisYear: 0,
      licenses: [],                        // license_id ที่สอบผ่านแล้ว
      conscriptionYearsLeft: 0             // จำนวนปีทหารเกณฑ์ที่เหลือ (กรณีจับได้ใบแดง/สมัคร)
    },

    // ป้ายสถานะแยกหมวดชัดเจน (และถูกรวมตรวจสอบใน utils.checkRequirement อัตโนมัติ)
    innateTraits: [], // พรสวรรค์แต่กำเนิด เช่น trait_quick_learner
    talentTags: [],   // ป้ายความถนัดสะสม เช่น tag_computer_nerd
    flags: [],        // ป้ายสถานะระบบ/ชนชั้น/จังหวัด/ใบอนุญาต เช่น flag_bkk_native
    statuses: [],     // โรคประจำตัวหรือบัฟร่างกาย เช่น status_office_syndrome

    // ระบบความสัมพันธ์ NPC, คู่รัก และบุตร
    relationships: {
      npcs: [],         // พ่อแม่ เพื่อน ผู้ใหญ่ [{ id, archetypeId, name, roleTitle, relationship, isAlive, passAwayAge }]
      partner: null,    // คนคุย/แฟน/คู่สมรส { id, archetypeId, name, relationship, status: 'crush'|'dating'|'married', financialTraitId }
      children: [],     // บุตร [{ id, name, gender, age, relationship, successPoints, currentStageId, currentPolicyId, outcomeId }]
      designatedHeirId: null
    },

    // แกนเวลา จังหวะเทิร์น คิวอีเวนต์ และระบบ 3 แต้มเวลาว่างต่อปี
    turn: {
      phase: 'FREE_ACTION', // 'YEAR_SUMMARY' | 'EVENT_QUEUE' | 'FREE_ACTION' | 'ENDED'
      areTabsLocked: false,
      freeActionPoints: MAX_FREE_ACTION_POINTS,
      maxFreeActionPoints: MAX_FREE_ACTION_POINTS,
      pendingEvents: [],         // คิวอีเวนต์ 1-3 ใบตามเดือนที่ต้องเคลียร์ในปีนี้
      currentEventIndex: 0,
      triggeredEventIdsThisLife: [],
      lastEventCategory: null,
      lifeFeedLog: []            // ประวัติบันทึกชีวิตย้อนหลังสำหรับแสดงใน Tab 1
    }
  };
}

/**
 * คำนวณความมั่งคั่งสุทธิ (Net Worth) และอัปเดตชนชั้นปัจจุบันตามเกณฑ์ใน Core_Rules_&_Locations.json
 * @param {object} state
 */
export function recalculateNetWorth(state) {
  if (!state || !state.finance) return 0;

  const cashTotal = Number(state.finance.cash || 0) + Number(state.finance.piggyBank || 0);

  let investmentsTotal = 0;
  for (const inv of Object.values(state.finance.investments || {})) {
    investmentsTotal += Number(inv?.amountCash || 0);
  }

  let assetsTotal = 0;
  for (const asset of state.finance.ownedAssets || []) {
    assetsTotal += Number(asset?.currentValue || 0);
  }

  let debtTotal = 0;
  for (const loan of state.finance.activeLoans || []) {
    debtTotal += Number(loan?.principalRemaining || 0);
  }
  for (const inst of state.finance.installments || []) {
    debtTotal += Number(inst?.annualPayment || 0) * Number(inst?.yearsRemaining || 0);
  }

  const netWorth = Math.round(cashTotal + investmentsTotal + assetsTotal - debtTotal);
  state.finance.netWorth = netWorth;

  // อัปเดตชนชั้นปัจจุบันเมื่อเป็นผู้ใหญ่ (อายุ >= 18)
  if (state.profile.age >= 18) {
    const classes = db.getAllClasses();
    for (const cls of classes) {
      if (netWorth >= cls.net_worth_min && netWorth <= cls.net_worth_max) {
        state.profile.currentClassId = cls.class_id;
        break;
      }
    }
  }

  return netWorth;
}

/**
 * สร้าง NPC พ่อและแม่ตั้งต้นสำหรับทารกแรกเกิด
 */
function createStartingParents(lastName, spawnClassId) {
  const fatherArch = db.indexes.npcArchetypes.get('npc_arch_father');
  const motherArch = db.indexes.npcArchetypes.get('npc_arch_mother');

  const fatherIdentity = generateThaiIdentity('male', spawnClassId, 'parent');
  const motherIdentity = generateThaiIdentity('female', spawnClassId, 'parent');

  const passRange = fatherArch?.inheritance_mechanic?.pass_away_age_range || [75, 80];

  const father = {
    id: 'npc_father',
    archetypeId: 'npc_arch_father',
    name: `พ่อ${fatherIdentity.nickname} (${fatherIdentity.firstName} ${lastName})`,
    shortName: `พ่อ${fatherIdentity.nickname}`,
    roleTitle: fatherArch?.role_title_th || 'คุณพ่อ',
    gender: 'male',
    ageAtPlayerBirth: randomInt(22, 34),
    passAwayParentAge: randomInt(passRange[0], passRange[1]),
    relationship: fatherArch?.starting_relationship ?? 80,
    isAlive: true,
    inheritanceClaimed: false
  };

  const mother = {
    id: 'npc_mother',
    archetypeId: 'npc_arch_mother',
    name: `แม่${motherIdentity.nickname} (${motherIdentity.firstName} ${lastName})`,
    shortName: `แม่${motherIdentity.nickname}`,
    roleTitle: motherArch?.role_title_th || 'คุณแม่',
    gender: 'female',
    ageAtPlayerBirth: randomInt(20, 32),
    passAwayParentAge: randomInt(78, 85),
    relationship: motherArch?.starting_relationship ?? 85,
    isAlive: true
  };

  return [father, mother];
}

/**
 * สร้างตัวละครแรกเกิด (อายุ 0 ขวบ) พร้อมคำนวณค่าสถานะตามชนชั้น จังหวัด และพรสวรรค์ติดตัว
 *
 * @param {string|null} [birthClassId=null] รหัสชนชั้น เช่น 'class_1'..'class_5' (หากไม่ระบุจะสุ่มตาม spawn_weight_percent)
 * @param {string|null} [locationId=null] รหัสจังหวัด เช่น 'loc_bangkok' (หากไม่ระบุจะสุ่มจาก 12 จังหวัด)
 * @param {'male'|'female'|null} [gender=null] เพศ (หากไม่ระบุจะสุ่ม 50/50)
 * @param {string|null} [name=null] ชื่อตัวละคร (หากไม่ระบุจะสุ่มชื่อ-นามสกุลไทยตามชนชั้น)
 * @param {object} [options={}] ตัวเลือกเสริม เช่น { purchasedTraitIds: [] } สำหรับโหมดจุติใหม่ใช้แต้มบุญ
 * @returns {object} GameState ที่สร้างเสร็จและพร้อมบันทึกลงหน่วยความจำ
 */
export function createNewCharacter(
  birthClassId = null,
  locationId = null,
  gender = null,
  name = null,
  options = {}
) {
  if (!db.isLoaded) {
    throw new Error('[State] ต้องเรียก db.loadAllData() ให้เสร็จก่อนสร้างตัวละครใหม่');
  }

  const state = createEmptyGameState();
  const purchasedTraitIds = Array.isArray(options.purchasedTraitIds) ? options.purchasedTraitIds : [];

  // 1. เช็กพรสวรรค์คาบช้อนเงินช้อนทอง (trait_silver_spoon บังคับสุ่มเกิด class_4 หรือ class_5)
  const hasSilverSpoon = purchasedTraitIds.includes('trait_silver_spoon');

  // 2. กำหนดชนชั้นกำเนิด (Social Class)
  let chosenClass = birthClassId ? db.getClass(birthClassId) : null;
  if (!chosenClass) {
    const allClasses = db.getAllClasses();
    const candidateClasses = hasSilverSpoon
      ? allClasses.filter((c) => c.class_id === 'class_4' || c.class_id === 'class_5')
      : allClasses;
    chosenClass = weightedRandom(candidateClasses, 'spawn_weight_percent') || allClasses[0];
  }

  // 3. กำหนดจังหวัดบ้านเกิด (Location)
  let chosenLocation = locationId ? db.getLocation(locationId) : null;
  if (!chosenLocation) {
    chosenLocation = pickRandom(db.getAllLocations());
  }

  // 4. กำหนดเพศและชื่อ-นามสกุลไทย
  const resolvedGender = gender === 'male' || gender === 'female'
    ? gender
    : (Math.random() < 0.5 ? 'male' : 'female');
  const titlePrefix = resolvedGender === 'female' ? 'ด.ญ.' : 'ด.ช.';
  const identity = generateThaiIdentity(resolvedGender, chosenClass.class_id, 'player');

  const displayName = name && String(name).trim().length > 0
    ? String(name).trim()
    : `${identity.firstName} ${identity.lastName} (${identity.nickname})`;

  state.profile = {
    ...state.profile,
    name: displayName,
    firstName: identity.firstName,
    lastName: identity.lastName,
    nickname: identity.nickname,
    gender: resolvedGender,
    titlePrefix,
    age: 0,
    lifePhaseId: 'phase_1_infant',
    spawnClassId: chosenClass.class_id,
    currentClassId: chosenClass.class_id,
    birthLocationId: chosenLocation.location_id,
    currentLocationId: chosenLocation.location_id,
    isAlive: true,
    deathCauseId: null
  };

  // 5. สุ่มค่าสถานะพื้นฐานแรกเกิด + บวก/ลบ starting_stat_modifiers ตามชนชั้น
  const baseStats = {
    health: randomInt(60, 80),
    happiness: randomInt(60, 80),
    intelligence: randomInt(40, 65),
    connections: randomInt(40, 60),
    merit: 10,
    appearance: randomInt(40, 65)
  };

  const classMods = chosenClass.starting_stat_modifiers || {};
  state.stats = {
    health: clampStat(baseStats.health + Number(classMods.health || 0), 1, 100),
    happiness: clampStat(baseStats.happiness + Number(classMods.happiness || 0), 0, 100),
    intelligence: clampStat(baseStats.intelligence + Number(classMods.intelligence || 0) + Number(chosenLocation.education_quality_bonus || 0), 0, 100),
    connections: clampStat(baseStats.connections + Number(classMods.connections || 0), 0, 100),
    merit: clampStat(baseStats.merit + Number(classMods.merit || 0), -9999, null),
    appearance: clampStat(baseStats.appearance + Number(classMods.appearance || 0), 0, 100)
  };

  // 6. ตั้งค่าป้ายสถานะเริ่มต้นจากชนชั้น และจังหวัดบ้านเกิด
  const flagSet = new Set([
    ...(chosenClass.starting_flags || []),
    ...(chosenLocation.local_flags_granted || [])
  ]);

  // 7. ตั้งค่าพรสวรรค์แต่กำเนิด (Innate Traits): หากไม่ได้ซื้อมา จะสุ่มโอกาสได้พรสวรรค์ธรรมชาติ 1 อย่าง
  const innateSet = new Set(purchasedTraitIds);
  if (innateSet.size === 0 && Math.random() < 0.45) {
    const naturalTraits = db.getAllInnateTraits().filter(
      (t) => t.type === 'positive_innate' || t.type === 'negative_innate'
    );
    const randomTrait = pickRandom(naturalTraits);
    if (randomTrait) innateSet.add(randomTrait.id);
  }
  state.innateTraits = Array.from(innateSet);
  state.flags = Array.from(flagSet);

  // 8. ตั้งค่าเงินกระปุกออมสินแรกเกิด (เงินรับขวัญตามฐานะพ่อแม่: 1 ปีของ parent_annual_support_age_0_to_17 หารสัดส่วนขวัญถุง)
  const annualParentSupport = Number(chosenClass.parent_annual_support_age_0_to_17 || 0);
  const initialPiggyGift = Math.round(annualParentSupport * 0.25);

  state.finance.cash = 0; // วัยทารกเก็บเงินแต๊ะเอีย/ค่าขนมสะสมไว้ในกระปุกออมสินจนกว่าจะอายุ 7 ขวบ
  state.finance.piggyBank = initialPiggyGift;
  state.finance.hasPiggyBankSmashed = false;
  state.finance.parentAnnualSupport = annualParentSupport;
  state.finance.baseAnnualLivingCost = 0;

  // 9. สร้าง NPC คุณพ่อและคุณแม่
  state.relationships.npcs = createStartingParents(identity.lastName, chosenClass.class_id);

  // 10. คำนวณความมั่งคั่งสุทธิเริ่มต้น และบันทึกข้อความแรกในบันทึกชีวิต
  recalculateNetWorth(state);

  state.turn.freeActionPoints = MAX_FREE_ACTION_POINTS;
  state.turn.lifeFeedLog.push({
    age: 0,
    monthTh: 'มกราคม',
    type: 'birth',
    title: '👶 ลืมตาดูโลก!',
    message: `${titlePrefix} ${displayName} เกิดในครอบครัวฐานะ "${chosenClass.name_th}" ณ จังหวัด${chosenLocation.name_th} พร้อมเงินรับขวัญในกระปุกออมสิน ${initialPiggyGift.toLocaleString('th-TH')} ฿`
  });

  currentState = state;
  saveGame(state);

  return state;
}

/**
 * ดึง GameState ปัจจุบันใน Memory
 */
export function getState() {
  return currentState;
}

/**
 * แทนที่ GameState ปัจจุบันใน Memory
 */
export function setState(newState) {
  currentState = newState;
  return currentState;
}

/**
 * ตรวจสอบว่ามีเซฟเกมค้างอยู่ใน localStorage หรือไม่
 * @returns {boolean}
 */
export function hasSavedGame() {
  try {
    return Boolean(localStorage.getItem(SAVE_STORAGE_KEY));
  } catch {
    return false;
  }
}

/**
 * บันทึก GameState ลง localStorage
 * @param {object} [stateToSave=currentState]
 * @returns {boolean}
 */
export function saveGame(stateToSave = currentState) {
  if (!stateToSave) return false;
  try {
    stateToSave.meta = {
      ...stateToSave.meta,
      updatedAt: new Date().toISOString()
    };
    recalculateNetWorth(stateToSave);
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(stateToSave));
    return true;
  } catch (err) {
    console.error('[State] บันทึกเซฟเกมลง localStorage ไม่สำเร็จ:', err);
    return false;
  }
}

/**
 * โหลด GameState จาก localStorage เข้าสู่ Memory
 * @returns {object|null}
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const template = createEmptyGameState();

    // Merge กับ template ป้องกันกรณีเพิ่มฟิลด์ใหม่ในอนาคตแล้วเซฟเก่าไม่มีฟิลด์นั้น
    currentState = {
      ...template,
      ...parsed,
      meta: { ...template.meta, ...(parsed.meta || {}) },
      profile: { ...template.profile, ...(parsed.profile || {}) },
      stats: { ...template.stats, ...(parsed.stats || {}) },
      statCounters: { ...template.statCounters, ...(parsed.statCounters || {}) },
      finance: { ...template.finance, ...(parsed.finance || {}) },
      careerAndEdu: { ...template.careerAndEdu, ...(parsed.careerAndEdu || {}) },
      relationships: { ...template.relationships, ...(parsed.relationships || {}) },
      turn: { ...template.turn, ...(parsed.turn || {}) }
    };

    return currentState;
  } catch (err) {
    console.error('[State] โหลดเซฟเกมจาก localStorage ล้มเหลว:', err);
    return null;
  }
}

/**
 * ลบเซฟเกมปัจจุบันออกจาก localStorage (เช่น เมื่อเริ่มชีวิตใหม่)
 */
export function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_STORAGE_KEY);
    currentState = null;
    return true;
  } catch (err) {
    console.error('[State] ลบเซฟเกมไม่สำเร็จ:', err);
    return false;
  }
}
