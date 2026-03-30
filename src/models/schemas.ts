import { z } from 'zod';

// ── Source API Payloads ──

export const LocalizedTextSchema = z.object({
  he: z.string().optional(),
  en: z.string().optional(),
});

export const PriceSchema = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string(),
  price_text: z.string().optional(),
});

export const GeoSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  precision: z.enum(['area', 'address']).optional(),
});

export const DeliverySchema = z.object({
  status: z.string(),
  expected_date: z.string().optional(),
});

export const MediaSetSchema = z.object({
  hero_image: z.string().optional(),
  gallery: z.array(z.string()).default([]),
  videos: z.array(z.string()).default([]),
  floorplans: z.array(z.string()).default([]),
});

export const MarketingFlagsSchema = z.object({
  campaign_ready: z.boolean().default(false),
  priority_score: z.number().default(0),
  target_audiences: z.array(z.string()).default([]),
  angles: z.array(z.string()).default([]),
  urgent: z.boolean().default(false),
  is_new: z.boolean().default(false),
  price_changed: z.boolean().default(false),
  video_preferred: z.boolean().default(false),
  languages: z.array(z.string()).default(['he']),
});

export const PropertyPayloadSchema = z.object({
  id: z.string(),
  type: z.literal('property').default('property'),
  status: z.string(),
  listing_status: z.string().optional(),
  title: LocalizedTextSchema,
  descriptions: z.object({
    short: LocalizedTextSchema.optional(),
    long: LocalizedTextSchema.optional(),
  }).optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  address_public: z.string().nullable().optional(),
  geo: GeoSchema.optional(),
  price: PriceSchema.optional(),
  rooms: z.number().optional(),
  bathrooms: z.number().optional(),
  size_m2: z.number().optional(),
  covered_veranda_m2: z.number().optional(),
  roof_garden_m2: z.number().optional(),
  project_id: z.string().optional(),
  features: z.array(z.string()).default([]),
  delivery: DeliverySchema.optional(),
  media: MediaSetSchema.optional(),
  marketing: MarketingFlagsSchema.optional(),
  seo: z.object({ url: z.string() }).optional(),
  updated_at: z.string(),
  published_at: z.string().optional(),
});

export const ProjectPayloadSchema = z.object({
  id: z.string(),
  type: z.literal('project').default('project'),
  status: z.string(),
  title: LocalizedTextSchema,
  descriptions: z.object({
    short: LocalizedTextSchema.optional(),
    long: LocalizedTextSchema.optional(),
  }).optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  geo: GeoSchema.optional(),
  price_range: z.object({
    min: z.number(),
    max: z.number(),
    currency: z.string(),
  }).optional(),
  total_units: z.number().optional(),
  available_units: z.number().optional(),
  features: z.array(z.string()).default([]),
  delivery: DeliverySchema.optional(),
  media: MediaSetSchema.optional(),
  marketing: MarketingFlagsSchema.optional(),
  seo: z.object({ url: z.string() }).optional(),
  updated_at: z.string(),
});

export const ChangeEventSchema = z.object({
  entity_type: z.enum(['property', 'project']),
  entity_id: z.string(),
  change_type: z.string(),
  updated_at: z.string(),
});

export const ChangesResponseSchema = z.object({
  checkpoint: z.string(),
  changes: z.array(ChangeEventSchema),
});

// ── Internal Domain Types ──

export type EntityType = 'property' | 'project';
export type Platform = 'facebook' | 'instagram' | 'tiktok';
export type ApprovalStatus = 'pending' | 'approved' | 'approved_with_edits' | 'rejected' | 'regeneration_requested' | 'expired';
export type PublishStatus = 'queued' | 'uploaded' | 'draft_created' | 'published' | 'paused' | 'failed' | 'withdrawn';
export type ReviewStatus = 'pass' | 'warn' | 'fail';

export interface SourceEntity {
  id: string;
  client_id?: string;
  entity_type: EntityType;
  source_entity_id: string;
  source_updated_at: string;
  source_status: string;
  country?: string;
  city?: string;
  area?: string;
  title_he?: string;
  title_en?: string;
  listing_url?: string;
  campaign_ready: boolean;
  current_snapshot_id?: string;
  created_at: string;
  updated_at: string;
}

export interface EntitySnapshot {
  id: string;
  entity_id: string;
  sync_run_id?: string;
  version_no: number;
  normalized_payload: Record<string, unknown>;
  source_payload: Record<string, unknown>;
  checksum: string;
  created_at: string;
}

export interface ChangeEvent {
  id: string;
  entity_id: string;
  from_snapshot_id?: string;
  to_snapshot_id?: string;
  change_type: string;
  diff_json: Record<string, unknown>;
  created_at: string;
}

export interface CampaignCandidate {
  id: string;
  client_id?: string;
  entity_id: string;
  candidate_date: string;
  score_total: number;
  score_freshness: number;
  score_media: number;
  score_business: number;
  score_urgency: number;
  score_history: number;
  recommended_angle?: string;
  recommended_audiences: string[];
  recommended_platforms: Platform[];
  selected: boolean;
  selection_reason?: string;
  created_at: string;
}

export interface CreativeBatch {
  id: string;
  client_id?: string;
  entity_id: string;
  candidate_id?: string;
  language_code: string;
  angle?: string;
  audience?: string;
  batch_status: string;
  created_at: string;
}

export interface CreativeVariant {
  id: string;
  batch_id: string;
  platform: Platform;
  variant_no: number;
  copy_json: Record<string, unknown>;
  media_plan_json: Record<string, unknown>;
  generation_metadata: Record<string, unknown>;
  created_at: string;
}

export interface QAReview {
  id: string;
  creative_variant_id: string;
  status: ReviewStatus;
  review_json: Record<string, unknown>;
  reviewed_at: string;
}

export interface ApprovalTask {
  id: string;
  creative_variant_id: string;
  assigned_to?: string;
  status: ApprovalStatus;
  decision_notes?: string;
  decided_at?: string;
  created_at: string;
}

export interface PublishAction {
  id: string;
  creative_variant_id: string;
  platform: Platform;
  publish_mode: string;
  status: PublishStatus;
  external_object_id?: string;
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
  published_at?: string;
  created_at: string;
}

export interface PerformanceMetric {
  id: string;
  publish_action_id: string;
  metric_date: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr?: number;
  leads: number;
  video_3s_views: number;
  video_completions: number;
  raw_metrics_json: Record<string, unknown>;
  created_at: string;
}

// ── Auth ──

export type UserRole = 'admin' | 'manager' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

// ── Clients ──

export interface ClientApiConfig {
  base_url: string;
  api_token: string;
  filters: {
    city?: string;
    propertyType?: string;
  };
}

export interface DriveMediaFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  size?: number;
  createdTime?: string;
  modifiedTime?: string;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  contact_person: string;
  email: string;
  phone?: string;
  google_drive_folder_id?: string;
  google_drive_folder_url?: string;
  drive_last_sync_at?: string;
  drive_file_count?: number;
  api_config?: ClientApiConfig;
  notes?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type PropertyPayload = z.infer<typeof PropertyPayloadSchema>;
export type ProjectPayload = z.infer<typeof ProjectPayloadSchema>;
