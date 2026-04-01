import { store } from '../db/store';
import { ingestProperty, ingestProject, IngestResult } from './ingest';
import { scoreAndSelectCandidates } from './scoring';
import { generateCreativesForCandidate } from './creative';
import { runQAAndCreateApprovals } from './qa';
import { syncAndCacheDriveMedia } from './google-drive';

export interface PipelineResult {
  ingest: IngestResult[];
  candidates: number;
  selected: number;
  batches: number;
  variants: number;
  reviews: number;
  approvals: number;
}

// Pre-sync Drive media for clients before creative generation
async function syncDriveForPipeline(clientId?: string): Promise<void> {
  const allClients = clientId
    ? [await store.getClient(clientId)].filter((c): c is NonNullable<typeof c> => !!c)
    : (await store.getClients()).filter(c => c.active && c.google_drive_folder_id);

  for (const client of allClients) {
    if (!client.google_drive_folder_id) continue;
    try {
      await syncAndCacheDriveMedia(client);
    } catch (err) {
      console.error(`[pipeline] Drive sync failed for client ${client.id}:`, err);
      // Non-fatal: pipeline continues with cached/API-only media
    }
  }
}

export async function runDailyPipeline(date?: string, clientId?: string): Promise<PipelineResult> {
  const today = date ?? new Date().toISOString().split('T')[0];

  // Pre-sync Drive media so creatives have latest files
  await syncDriveForPipeline(clientId);

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
