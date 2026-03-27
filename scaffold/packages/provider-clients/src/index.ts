export interface ProviderResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function notImplementedProvider<T>(name: string): Promise<ProviderResponse<T>> {
  return { ok: false, error: `${name} provider not implemented` };
}
