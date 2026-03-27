export class ContentAgent {
  async run(input: unknown) {
    return {
      agent: "content-agent",
      status: "not-implemented",
      input
    };
  }
}
