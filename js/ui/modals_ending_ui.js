/**
 * js/ui/modals_ending_ui.js
 * จัดการ Toast, Modal กลาง, Modal สลิปงบต้นปี, Modal แก้หนี้ฉุกเฉิน และหน้าฉากจบ SSR-E
 */

import { db } from '../core/db.js';
import { loadMetaState } from '../core/state.js';
import { formatCurrency } from '../core/utils.js';
import { stripEmojis } from '../engine/event_engine.js';
import {
  finalizeLifeAndCalculateKarmicBalance,
  finishAndReturnToLobby
} from '../engine/ending_engine.js';
import {
  continueAsNextGenerationHeir,
  resolveEmergencyDebtAndContinue,
  triggerPrimaryActionButton
} from '../engine/turn_manager.js';
import { escapeHtml, renderIcon } from './icons.js';

let currentModalClosable = true;

/**
 * แสดง Toast แจ้งเตือนมุมบน
 */
export function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root || !message) return;

  const cleanMsg = stripEmojis(String(message));
  const toast = document.createElement('div');
  const iconKey = type === 'error' ? 'alert' : (type === 'success' ? 'check' : 'info');
  toast.className = `toast ${type === 'error' ? 'toast--error' : (type === 'success' ? 'toast--success' : '')}`;
  toast.innerHTML = `${renderIcon(iconKey, 'svg-icon--sm')}<span>${escapeHtml(cleanMsg)}</span>`;
  root.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

/**
 * เปิด Modal กลาง
 */
export function openModal(innerHtml, { closable = true } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;

  currentModalClosable = closable;
  root.innerHTML = `<div class="modal-dialog" role="dialog" aria-modal="true">${innerHtml}</div>`;
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');

  root.onclick = (e) => {
    if (e.target === root && currentModalClosable) {
      closeModal();
    }
  };

  root.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal());
  });
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
}

/**
 * Modal สลิปสรุปงบการเงินต้นปี (YEAR_SUMMARY)
 */
export function openAnnualSlipModal(state, onComplete) {
  const slip = state?.finance?.lastAnnualSlip;
  if (!slip) return;

  const incomeRows = (slip.incomeItems || [])
    .map(
      (item) => `
      <div class="slip-row">
        <span>${escapeHtml(stripEmojis(item.labelTh))}</span>
        <span class="amt-pos">${escapeHtml(formatCurrency(item.amount, { showPlus: true }))}</span>
      </div>`
    )
    .join('');

  const expenseRows = (slip.expenseItems || [])
    .map(
      (item) => `
      <div class="slip-row">
        <span>${escapeHtml(stripEmojis(item.labelTh))}</span>
        <span class="amt-neg">${escapeHtml(formatCurrency(item.amount))}</span>
      </div>`
    )
    .join('');

  const marketHtml = slip.marketHeadlineTh
    ? `
      <div class="card card--warning" style="padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:13px;">
          ${renderIcon('chart_up', 'svg-icon--sm')}
          <span>ข่าวตลาด: ${escapeHtml(stripEmojis(slip.marketHeadlineTh))}</span>
        </div>
        ${
          (slip.marketItems || []).length > 0
            ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px;font-size:12px;">
                ${slip.marketItems
                  .map(
                    (m) => `
                  <div style="display:flex;justify-content:space-between;">
                    <span>${escapeHtml(stripEmojis(m.nameTh))}</span>
                    <span class="${m.deltaValue >= 0 ? 'amt-pos' : 'amt-neg'}">
                      ${m.pctChange >= 0 ? '+' : ''}${m.pctChange}% (${escapeHtml(formatCurrency(m.deltaValue, { showPlus: true }))})
                    </span>
                  </div>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>`
    : '';

  const piggyNote =
    slip.piggySmashBonus > 0
      ? `<div class="pill-badge pill-badge--gold" style="width:100%;justify-content:center;">
          ${renderIcon('piggy', 'svg-icon--sm')}
          <span>ทุบกระปุกวัย 7 ปี โอนเข้าบัญชี ${escapeHtml(formatCurrency(slip.piggySmashBonus))}</span>
        </div>`
      : '';

  const familySupportNote = Number(slip.familyPaidSupportAnnual || 0) > 0
    ? `<div class="card" style="padding:9px 12px;background:var(--info-bg);font-size:12px;line-height:1.45;">
        ครอบครัวช่วยจ่ายค่าใช้จ่ายพื้นฐานโดยตรงประมาณ ${escapeHtml(formatCurrency(slip.familyPaidSupportAnnual))} ในปีนี้ (ไม่ใช่เงินสดหรือ Net Worth ของคุณ)
      </div>`
    : '';
  const netFlow = Number(slip.netCashFlow || 0);

  openModal(
    `
    <div class="modal-header">
      <div class="modal-title">
        ${renderIcon('file_text')}
        <span>สลิปงบประจำปี (อายุ ${slip.age} ปี)</span>
      </div>
      <span class="pill-badge pill-badge--soft-blue">พ.ศ. ${slip.yearBE}</span>
    </div>

    ${piggyNote}
    ${familySupportNote}

    <div class="card" style="padding:10px 12px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--success);">รายรับประจำปี</div>
      ${incomeRows || '<div style="font-size:12.5px;color:var(--text-muted);">ไม่มีรายรับเงินสดในปีนี้</div>'}
      <div class="divider"></div>
      <div style="font-weight:700;font-size:13px;margin:4px 0;color:var(--danger);">รายจ่ายและภาระหนี้สิน</div>
      ${expenseRows || '<div style="font-size:12.5px;color:var(--text-muted);">ไม่มีรายจ่ายเงินสดในปีนี้</div>'}
    </div>

    ${marketHtml}

    <div class="card" style="padding:10px 12px;background:var(--navy-50);">
      <div class="slip-row">
        <span>กระแสเงินสดสุทธิปีนี้</span>
        <span class="${netFlow >= 0 ? 'amt-pos' : 'amt-neg'}">${escapeHtml(formatCurrency(netFlow, { showPlus: true }))}</span>
      </div>
      <div class="slip-row">
        <span>เงินสดคงเหลือ</span>
        <strong>${escapeHtml(formatCurrency(slip.endingCash))}</strong>
      </div>
      ${
        slip.endingPiggy > 0
          ? `<div class="slip-row"><span>กระปุกออมสิน</span><strong>${escapeHtml(formatCurrency(slip.endingPiggy))}</strong></div>`
          : ''
      }
      <div class="slip-row">
        <span>ความมั่งคั่งสุทธิ (Net Worth)</span>
        <strong>${escapeHtml(formatCurrency(slip.netWorth))}</strong>
      </div>
    </div>

    <button id="btn-ack-slip" class="btn btn--primary btn--block">
      ${renderIcon('check', 'svg-icon--sm')}
      <span>รับทราบและเริ่มเหตุการณ์ปีนี้</span>
    </button>
    `,
    { closable: false }
  );

  document.getElementById('btn-ack-slip')?.addEventListener('click', () => {
    closeModal();
    triggerPrimaryActionButton(state);
    if (typeof onComplete === 'function') onComplete();
  });
}

/**
 * Modal จัดการหนี้ติดลบฉุกเฉิน (EMERGENCY_DEBT) — ห้ามปิดจนกว่าจะเคลียร์เป็น >= 0
 */
export function openEmergencyDebtModal(state, onResolved) {
  const info = state?.turn?.pendingEmergencyDebt;
  if (!info || info.resolved) return;

  const autoLogsHtml = (info.autoActionsLog || []).length
    ? `<div class="card card--warning" style="padding:10px 12px;font-size:12.5px;">
        ${info.autoActionsLog.map((line) => `<p>• ${escapeHtml(stripEmojis(line))}</p>`).join('')}
      </div>`
    : '';

  const optionsHtml = (info.availableOptions || [])
    .map((opt) => {
      if (opt.optionType === 'sell_resellable_asset_at_80_percent_value') {
        const assetBtns = (opt.assets || [])
          .map(
            (a) => `
            <button class="btn btn--outline btn--sm btn--block" data-debt-opt="sell_resellable_asset_at_80_percent_value" data-instance-id="${escapeHtml(a.instanceId)}">
              ${renderIcon('coin', 'svg-icon--sm')}
              <span>ขาย ${escapeHtml(stripEmojis(a.nameTh))} (+${escapeHtml(formatCurrency(a.netProceeds))})</span>
            </button>`
          )
          .join('');
        return `<div class="list-stack" style="gap:6px;"><div style="font-size:12.5px;font-weight:700;">${escapeHtml(stripEmojis(opt.labelTh))}</div>${assetBtns}</div>`;
      }

      const btnClass =
        opt.optionType === 'forced_informal_shark_loan_to_cover_deficit' ? 'btn--danger' : 'btn--primary';

      return `
        <button class="btn ${btnClass} btn--block" data-debt-opt="${escapeHtml(opt.optionType)}">
          ${renderIcon('alert', 'svg-icon--sm')}
          <span>${escapeHtml(stripEmojis(opt.labelTh))}</span>
        </button>`;
    })
    .join('');

  openModal(
    `
    <div class="modal-header">
      <div class="modal-title" style="color:var(--danger);">
        ${renderIcon('alert')}
        <span>ฉุกเฉิน: เงินสดติดลบ!</span>
      </div>
    </div>

    <div class="card card--danger" style="text-align:center;">
      <div style="font-size:13px;color:var(--text-secondary);">ยอดที่ต้องหาเงินมาโปะด่วน</div>
      <div style="font-size:26px;font-weight:800;color:var(--danger);font-family:var(--font-display);">
        -${escapeHtml(formatCurrency(info.deficitAmount))}
      </div>
    </div>

    ${autoLogsHtml}

    <div class="list-stack">
      <div style="font-size:13px;font-weight:700;">เลือกทางรอดทางการเงิน:</div>
      ${optionsHtml}
    </div>
    `,
    { closable: false }
  );

  document.querySelectorAll('[data-debt-opt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const optionType = btn.getAttribute('data-debt-opt');
      const instanceId = btn.getAttribute('data-instance-id') || null;
      const res = resolveEmergencyDebtAndContinue(optionType, { instanceId }, state);
      if (!res.success) {
        showToast(res.message || 'ดำเนินการไม่สำเร็จ', 'error');
        return;
      }
      closeModal();
      if (!res.resolved) {
        openEmergencyDebtModal(state, onResolved);
      } else {
        showToast(res.message, 'success');
        if (typeof onResolved === 'function') onResolved();
      }
    });
  });
}

/**
 * หน้าจอฉากจบชีวิต SSR-E และส่งต่อมรดกรุ่นลูก
 */
export function renderEndingScreen(state, { onContinueAsChild, onReturnToLobby }) {
  const report = finalizeLifeAndCalculateKarmicBalance(state);
  const meta = loadMetaState();

  const { summaryProfile, deathInfo, endingTier, karmicSummary, inheritanceSummary } = report;
  const totalEndingsCount =
    (db.raw.loansCrisesEndings?.ending_archetypes_and_merit_conversion?.ending_tiers || []).length || 9;

  const meritRowsHtml = (karmicSummary.meritBreakdown || [])
    .map(
      (row) => `
      <div class="slip-row">
        <span style="display:inline-flex;align-items:center;gap:6px;">
          ${renderIcon(row.iconKey || 'sparkle', 'svg-icon--sm')}
          <span>${escapeHtml(row.labelTh)}</span>
        </span>
        <span class="amt-pos">+${row.points} แต้มบุญ</span>
      </div>`
    )
    .join('');

  const heirsList = inheritanceSummary.heirsList || [];
  let selectedHeirId = inheritanceSummary.designatedHeirId || (heirsList[0]?.id ?? null);

  const heirSelectorHtml =
    inheritanceSummary.canContinueAsChild && heirsList.length > 1
      ? `
      <div style="margin-top:8px;">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">เลือกทายาทที่จะสวมบทบาทต่อ:</label>
        <select id="select-legacy-heir" class="input-text" style="border-radius:var(--radius-md);">
          ${heirsList
            .map(
              (h) =>
                `<option value="${escapeHtml(h.id)}" ${h.id === selectedHeirId ? 'selected' : ''}>${escapeHtml(h.name)} (อายุ ${h.ageAtParentDeath} ปี • ความสัมพันธ์ ${h.relationship}%)</option>`
            )
            .join('')}
        </select>
      </div>`
      : '';

  return {
    html: `
      <div class="screen-scroll">
        <div style="text-align:center;padding-top:6px;">
          <div style="display:inline-flex;align-items:center;gap:8px;color:var(--navy-900);">
            ${renderIcon(endingTier.rankIconKey || 'crown', 'svg-icon--xl')}
            <div style="text-align:left;">
              <h2 style="font-size:20px;">บันทึกชีวิตบทอวสาน</h2>
              <p style="font-size:12.5px;color:var(--text-secondary);">วัฏสงสารและบทสรุปชะตากรรม (รุ่นที่ ${summaryProfile.generationNumber})</p>
            </div>
          </div>
        </div>

        <div class="card card--gold" style="text-align:center;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:center;">
            <span class="pill-badge pill-badge--gold" style="font-size:13px;padding:6px 14px;">
              ${renderIcon(endingTier.rankIconKey || 'crown', 'svg-icon--sm')}
              <span>ฉากจบระดับ: ${escapeHtml(endingTier.rank)} • ${escapeHtml(endingTier.titleTh)}</span>
            </span>
          </div>

          <div>
            <h3 style="font-size:19px;">${escapeHtml(summaryProfile.fullName)} (อายุ ${summaryProfile.finalAge} ปี)</h3>
            <p style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.45;">
              ${escapeHtml(deathInfo?.obituaryTextTh || endingTier.summaryTh)}
            </p>
          </div>

          <div class="divider"></div>

          <div class="grid-2" style="text-align:left;gap:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              ${renderIcon('coin')}
              <div>
                <div style="font-size:11px;color:var(--text-muted);">ทรัพย์สินสุทธิสุดท้าย</div>
                <div style="font-size:13.5px;font-weight:700;">${escapeHtml(formatCurrency(summaryProfile.finalNetWorth))}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${renderIcon('work')}
              <div>
                <div style="font-size:11px;color:var(--text-muted);">เส้นทางอาชีพหลัก</div>
                <div style="font-size:13.5px;font-weight:700;">${escapeHtml(summaryProfile.notableCareerNameTh)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${renderIcon('users')}
              <div>
                <div style="font-size:11px;color:var(--text-muted);">ทายาทสืบทอด</div>
                <div style="font-size:13.5px;font-weight:700;">${summaryProfile.childrenCount} คน</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${renderIcon('trophy')}
              <div>
                <div style="font-size:11px;color:var(--text-muted);">ฉากจบที่ปลดล็อก</div>
                <div style="font-size:13.5px;font-weight:700;">${meta.unlockedEndings.length}/${totalEndingsCount} ระดับ</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            ${renderIcon('sparkle')}
            <h3 style="font-size:15.5px;">การคำนวณแต้มบุญข้ามภพชาติ (Karmic Balance)</h3>
          </div>
          ${meritRowsHtml}
          <div style="margin-top:10px;background:var(--navy-900);color:#fff;border-radius:var(--radius-pill);padding:9px 14px;display:flex;align-items:center;justify-content:center;gap:8px;font-family:var(--font-display);font-weight:700;font-size:14px;">
            ${renderIcon('sparkle', 'svg-icon--sm')}
            <span>แต้มบุญสะสมรวมสำหรับชาติถัดไป: ${karmicSummary.newKarmaBankTotal.toLocaleString('th-TH')} แต้ม</span>
          </div>
        </div>

        <div class="list-stack">
          ${
            inheritanceSummary.canContinueAsChild
              ? `
            <div class="card" style="padding:12px;">
              <div style="font-size:12.5px;color:var(--text-secondary);">
                มรดกหลังหักภาษี (${inheritanceSummary.taxRatePercent}%): <strong>${escapeHtml(formatCurrency(inheritanceSummary.netEstateForHeirs))}</strong>
                ${inheritanceSummary.hasValidWill ? ' (มีพินัยกรรม ยกเว้นภาษี 0%)' : ' (ไม่มีพินัยกรรม หักภาษี 10%)'}
              </div>
              ${heirSelectorHtml}
              <button id="btn-legacy-continue" class="btn btn--primary btn--block" style="margin-top:10px;justify-content:space-between;">
                <span>ส่งต่อมรดกให้รุ่นลูก (เริ่มวัย 18 ปี)</span>
                ${renderIcon('chevron_right', 'svg-icon--sm')}
              </button>
            </div>`
              : `<div class="card card--muted" style="text-align:center;font-size:12.5px;color:var(--text-muted);">ไม่มีทายาทสืบทอดในรอบชีวิตนี้</div>`
          }

          <button id="btn-end-to-lobby" class="btn btn--outline btn--block">
            ${renderIcon('refresh', 'svg-icon--sm')}
            <span>กลับสู่วังวนจุติใหม่ (หน้าหลัก)</span>
          </button>
        </div>

        <div class="app-footer-credit">สู้ชีวิต Simulator • 1 ใน 70 ล้าน</div>
      </div>
    `,
    bind(rootEl) {
      const heirSelect = rootEl.querySelector('#select-legacy-heir');
      if (heirSelect) {
        heirSelect.addEventListener('change', (e) => {
          selectedHeirId = e.target.value;
        });
      }

      rootEl.querySelector('#btn-legacy-continue')?.addEventListener('click', () => {
        const res = continueAsNextGenerationHeir(state, selectedHeirId);
        if (!res.success) {
          showToast(res.message || 'ไม่สามารถสืบทอดรุ่นลูกได้', 'error');
          return;
        }
        showToast(res.message, 'success');
        if (typeof onContinueAsChild === 'function') onContinueAsChild(res.newState);
      });

      rootEl.querySelector('#btn-end-to-lobby')?.addEventListener('click', () => {
        finishAndReturnToLobby(state);
        if (typeof onReturnToLobby === 'function') onReturnToLobby();
      });
    }
  };
}