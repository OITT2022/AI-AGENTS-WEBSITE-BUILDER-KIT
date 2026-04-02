export interface PropertyRecord {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  areaSqm?: number;
  city?: string;
  country?: string;
  address?: string;
  features: string[];
  images: string[];
  videos: string[];
}
