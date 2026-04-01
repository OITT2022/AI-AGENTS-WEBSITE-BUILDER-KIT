import { v4 as uuid } from 'uuid';
import { store } from '../db/store';
import { QAReview, ReviewStatus, ApprovalTask, CreativeVariant } from '../models/schemas';

const RISKY_EN = ['guaranteed return','guaranteed yield','guaranteed appreciation','risk-free','no risk','tax-free','legal certainty','sure profit'];
const RISKY_HE = ['תשואה מובטחת','עליית ערך מובטחת','ללא סיכון','פטור ממס','רווח בטוח'];

interface Violation { check: string; message: string; severity: 'error' | 'warning'; }

function checkFacts(v: CreativeVariant, src: Record<string, unknown>): Violation[] {
  const violations: Violation[] = [];
  const text = JSON.stringify(v.copy_json).toLowerCase();

  // Check listing is still active
  if (src.status !== 'active') violations.push({ check: 'inactive_listing', message: `Status "${src.status}" not active`, severity: 'error' });

  // Check price in copy matches source
  const srcPrice = src.price_text as string | undefined;
  const srcAmount = src.price_amount as number | undefined;
  if (srcPrice || srcAmount) {
    const copyText = JSON.stringify(v.copy_json);
    // If source has a price, the copy must not contain a different price number
    if (srcAmount != null) {
      // Extract numbers from copy that look like prices (4+ digits)
      const pricePattern = /[\d,]+(?:\.\d+)?/g;
      const matches = copyText.match(pricePattern) ?? [];
      for (const m of matches) {
        const num = parseFloat(m.replace(/,/g, ''));
        if (num >= 1000 && Math.abs(num - srcAmount) > 1 && num !== srcAmount) {
          violations.push({ check: 'price_mismatch', message: `Copy contains "${m}" but source price is ${srcAmount}`, severity: 'error' });
          break;
        }
      }
    }
  }

  // Check city in copy matches source
  const srcCity = (src.city as string ?? '').toLowerCase().trim();
  if (srcCity) {
    const copyCity = text;
    // Check that copy doesn't mention a different well-known city while missing the source city
    // Simple check: source city should appear somewhere in the copy
    if (!copyCity.includes(srcCity)) {
      violations.push({ check: 'city_missing', message: `Copy does not mention source city "${src.city}"`, severity: 'warning' });
    }
  }

  return violations;
}

function checkCompliance(v: CreativeVariant): Violation[] {
  const violations: Violation[] = [];
  const text = JSON.stringify(v.copy_json).toLowerCase();
  for (const kw of RISKY_EN) if (text.includes(kw)) violations.push({ check: 'risky_claim', message: `Contains: "${kw}"`, severity: 'error' });
  for (const kw of RISKY_HE) if (text.includes(kw)) violations.push({ check: 'risky_claim_he', message: `Contains: "${kw}"`, severity: 'error' });
  return violations;
}

export async function reviewVariant(variantId: string): Promise<QAReview> {
  const variant = await store.getVariant(variantId);
  if (!variant) throw new Error(`Variant ${variantId} not found`);
  const batches = await store.getBatches();
  const batch = batches.find(b => b.id === variant.batch_id);
  if (!batch) throw new Error(`Batch not found`);
  const entity = await store.getEntity(batch.entity_id);
  if (!entity) throw new Error(`Entity not found`);
  const snapshots = await store.getSnapshots(entity.id);
  if (!snapshots[0]) throw new Error(`No snapshot`);

  const all = [...checkFacts(variant, snapshots[0].normalized_payload), ...checkCompliance(variant)];
  const errors = all.filter(v => v.severity === 'error');
  const warnings = all.filter(v => v.severity === 'warning');
  let status: ReviewStatus = errors.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';

  const review: QAReview = {
    id: uuid(), creative_variant_id: variantId, status,
    review_json: { violations: errors.map(v => ({ check: v.check, message: v.message })), warnings: warnings.map(v => ({ check: v.check, message: v.message })), checked_at: new Date().toISOString() },
    reviewed_at: new Date().toISOString(),
  };
  await store.addReview(review);
  return review;
}

export async function createApprovalTask(variantId: string): Promise<ApprovalTask> {
  const existing = await store.getApprovalTaskForVariant(variantId);
  if (existing) return existing;
  const task: ApprovalTask = { id: uuid(), creative_variant_id: variantId, status: 'pending', created_at: new Date().toISOString() };
  await store.upsertApprovalTask(task);
  return task;
}

export async function runQAAndCreateApprovals(batchId: string) {
  const variants = await store.getVariants(batchId);
  const reviews: QAReview[] = [];
  const approvalTasks: ApprovalTask[] = [];
  for (const v of variants) {
    const review = await reviewVariant(v.id);
    reviews.push(review);
    if (review.status !== 'fail') approvalTasks.push(await createApprovalTask(v.id));
  }
  return { reviews, approvalTasks };
}
