import { store } from '../db/store';
import { ingestProperty, ingestProject, IngestResult } from './ingest';
import { scoreAndSelectCandidates } from './scoring';
import { generateCreativesForCandidate } from './creative';
import { runQAAndCreateApprovals } from './qa';

export interface PipelineResult {
  ingest: IngestResult[];
  candidates: number;
  selected: number;
  batches: number;
  variants: number;
  reviews: number;
  approvals: number;
}

export async function runDailyPipeline(date?: string, clientId?: string): Promise<PipelineResult> {
  const today = date ?? new Date().toISOString().split('T')[0];
  const candidates = await scoreAndSelectCandidates(today, 10, clientId);
  const selected = candidates.filter(c => c.selected);
  let totalBatches = 0, totalVariants = 0, totalReviews = 0, totalApprovals = 0;

  for (const candidate of selected) {
    const { batch, variants } = await generateCreativesForCandidate(candidate);
    totalBatches++;
    totalVariants += variants.length;
    const { reviews, approvalTasks } = await runQAAndCreateApprovals(batch.id);
    totalReviews += reviews.length;
    totalApprovals += approvalTasks.length;
  }

  return { ingest: [], candidates: candidates.length, selected: selected.length, batches: totalBatches, variants: totalVariants, reviews: totalReviews, approvals: totalApprovals };
}

export async function ingestAndRunPipeline(properties: unknown[], projects: unknown[] = [], date?: string, clientId?: string): Promise<PipelineResult> {
  const results: IngestResult[] = [];
  for (const prop of properties) results.push(await ingestProperty(prop, clientId));
  for (const proj of projects) results.push(await ingestProject(proj, clientId));
  const pipelineResult = await runDailyPipeline(date, clientId);
  pipelineResult.ingest = results;
  return pipelineResult;
}
