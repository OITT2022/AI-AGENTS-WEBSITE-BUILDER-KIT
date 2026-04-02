import axios from "axios";

export class PublishClient {
  constructor(private readonly webhookUrl?: string) {}

  async publish(payload: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    await axios.post(this.webhookUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 20000
    });
  }
}
