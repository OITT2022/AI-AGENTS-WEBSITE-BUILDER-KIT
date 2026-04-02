import axios, { AxiosInstance } from "axios";
import { z } from "zod";
import { PropertyRecord } from "../../domain/PropertyRecord.js";

const propertySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string().default(""),
  description: z.string().default(""),
  price: z.number().default(0),
  currency: z.string().default("EUR"),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  areaSqm: z.number().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  address: z.string().optional(),
  features: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
  videos: z.array(z.string().url()).default([])
});

export class PropertyApiClient {
  private readonly http: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.http = axios.create({
      baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 20000
    });
  }

  async getProperty(propertyId: string): Promise<PropertyRecord> {
    const response = await this.http.get(`/properties/${propertyId}`);
    return propertySchema.parse(response.data);
  }
}
