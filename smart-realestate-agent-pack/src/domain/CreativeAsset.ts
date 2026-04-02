export interface CreativeAsset {
  type: "image" | "video" | "canva_design" | "text";
  url: string;
  label: string;
  metadata?: Record<string, unknown>;
}
