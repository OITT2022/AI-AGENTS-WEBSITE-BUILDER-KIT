import { store } from '../db/store';
import { ingestProperty, ingestProject, IngestResult } from './ingest';
import { scoreAndSelectCandidates } from './scoring';
import { generateCreativesForCandidate } from './creative';
import { runQAAndCreateApprovals } from './qa';
import { syncAndCacheDriveMedia } from './google-drive';
import * as imageAi from './image-ai';
import * as videoAi from './video-ai';
import * as log from '../lib/logger';

export interface PipelineResult {
  ingest: IngestResult[];
  candidates: number;
  selected: number;
  batches: number;
  variants: number;
  reviews: number;
  approvals: number;
  image_ai: { processed: number; errors: number };
  video_ai: { processed: number; errors: number };
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
      log.warn('pipeline.drive', `Drive sync failed for client ${client.id}: ${(err as Error).message}`, { client_id: client.id });
    }
  }
}

/** Run image AI on a batch's variants. Skips silently when not configured. */
async function runImageAI(batchId: string, entityId: string): Promise<{ processed: number; errors: number }> {
  if (!imageAi.isConfigured()) return { processed: 0, errors: 0 };
  let processed = 0, errors = 0;
  try {
    const entity = await store.getEntity(entityId);
    if (!entity?.current_snapshot_id) return { processed: 0, errors: 0 };
    const snapshot = await store.getSnapshot(entity.current_snapshot_id);
    if (!snapshot) return { processed: 0, errors: 0 };

    const variants = await store.getVariants(batchId);
    for (const variant of variants) {
      try {
        const sizeKey = `${variant.platform}_feed` as imageAi.PlatformSize;
        const platformSize = sizeKey in imageAi.PLATFORM_SIZES ? sizeKey : 'facebook_feed' as imageAi.PlatformSize;
        const images = await imageAi.generateAdImage(snapshot.normalized_payload, variant.copy_json, platformSize);
        const mediaPlan = { ...variant.media_plan_json } as Record<string, unknown>;
        mediaPlan.ai_generated_images = images.map(img => ({
          url: img.url, width: img.width, height: img.height,
          provider: img.provider, model: img.model, generation_id: img.generation_id,
        }));
        await store.updateVariant(variant.id, { media_plan_json: mediaPlan });
        processed++;
      } catch (err) {
        errors++;
        log.error('pipeline.image_ai', `Image AI failed for variant ${variant.id}: ${(err as Error).message}`, { batch_id: batchId, variant_id: variant.id });
      }
    }
  } catch (err) {
    log.error('pipeline.image_ai', `Image AI batch error: ${(err as Error).message}`, { batch_id: batchId });
  }
  return { processed, errors };
}

/** Run video AI on a batch's video-eligible variants. Skips silently when not configured. */
async function runVideoAI(batchId: string, entityId: string): Promise<{ processed: number; errors: number }> {
  if (!videoAi.isConfigured()) return { processed: 0, errors: 0 };
  let processed = 0, errors = 0;
  try {
    const entity = await store.getEntity(entityId);
    if (!entity?.current_snapshot_id) return { processed: 0, errors: 0 };
    const snapshot = await store.getSnapshot(entity.current_snapshot_id);
    if (!snapshot) return { processed: 0, errors: 0 };

    const variants = await store.getVariants(batchId);
    const videoVariants = variants.filter(v => {
      const mp = v.media_plan_json as Record<string, unknown>;
      return mp.reel_timeline || mp.video_ad;
    });
    for (const variant of videoVariants) {
      try {
        const mediaPlan = variant.media_plan_json as Record<string, unknown>;
        const timeline = mediaPlan.reel_timeline as videoAi.ReelTimeline | undefined;
        if (!timeline) continue;

        const video = await videoAi.generateAdVideo(snapshot.normalized_payload, timeline);
        const updatedPlan = { ...mediaPlan };
        updatedPlan.ai_generated_video = {
          url: video.url, duration_sec: video.duration_sec,
          provider: video.provider, render_id: video.render_id,
          generated_at: new Date().toISOString(),
        };
        await store.updateVariant(variant.id, { media_plan_json: updatedPlan });
        processed++;
      } catch (err) {
        errors++;
        log.error('pipeline.video_ai', `Video AI failed for variant ${variant.id}: ${(err as Error).message}`, { batch_id: batchId, variant_id: variant.id });
      }
    }
  } catch (err) {
    log.error('pipeline.video_ai', `Video AI batch error: ${(err as Error).message}`, { batch_id: batchId });
  }
  return { processed, errors };
}

export async function runDailyPipeline(date?: string, clientId?: string): Promise<PipelineResult> {
  const today = date ?? new Date().toISOString().split('T')[0];
  const pipelineLog = log.child({ client_id: clientId, date: today });

  pipelineLog.info('pipeline.start', `Daily pipeline for ${today}`);

  // Pre-sync Drive media so creatives have latest files
  await syncDriveForPipeline(clientId);

  const candidates = await scoreAndSelectCandidates(today, 10, clientId);
  const selected = candidates.filter(c => c.selected);
  pipelineLog.info('pipeline.scoring', `${candidates.length} candidates scored, ${selected.length} selected`);

  let totalBatches = 0, totalVariants = 0, totalReviews = 0, totalApprovals = 0;
  const imageAiTotals = { processed: 0, errors: 0 };
  const videoAiTotals = { processed: 0, errors: 0 };

  for (const candidate of selected) {
    const { batch, variants } = await generateCreativesForCandidate(candidate);
    totalBatches++;
    totalVariants += variants.length;
    pipelineLog.info('pipeline.creative', `Batch ${batch.id}: ${variants.length} variants generated`, { batch_id: batch.id, entity_id: batch.entity_id });

    // Optional: generate AI images and videos in parallel (safe — skips if not configured)
    const [imgResult, vidResult] = await Promise.all([
      runImageAI(batch.id, batch.entity_id),
      runVideoAI(batch.id, batch.entity_id),
    ]);
    imageAiTotals.processed += imgResult.processed;
    imageAiTotals.errors += imgResult.errors;
    videoAiTotals.processed += vidResult.processed;
    videoAiTotals.errors += vidResult.errors;

    // QA runs after AI generation so it can check generated content
    const { reviews, approvalTasks } = await runQAAndCreateApprovals(batch.id);
    totalReviews += reviews.length;
    totalApprovals += approvalTasks.length;
  }

  pipelineLog.info('pipeline.complete', `Pipeline done: ${totalBatches} batches, ${totalVariants} variants, ${totalApprovals} approvals`);

  return {
    ingest: [], candidates: candidates.length, selected: selected.length,
    batches: totalBatches, variants: totalVariants, reviews: totalReviews, approvals: totalApprovals,
    image_ai: imageAiTotals, video_ai: videoAiTotals,
  };
}

export async function ingestAndRunPipeline(properties: unknown[], projects: unknown[] = [], date?: string, clientId?: string): Promise<PipelineResult> {
  const results: IngestResult[] = [];
  for (const prop of properties) results.push(await ingestProperty(prop, clientId));
  for (const proj of projects) results.push(await ingestProject(proj, clientId));
  const pipelineResult = await runDailyPipeline(date, clientId);
  pipelineResult.ingest = results;
  return pipelineResult;
}
