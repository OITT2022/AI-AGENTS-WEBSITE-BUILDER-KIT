export const promptTemplates = {
  premiumPropertyImage: (headline: string) =>
    [
      "Premium real estate campaign image.",
      "Architectural realism.",
      "Magazine-grade lighting.",
      `Marketing intent: ${headline}`
    ].join(" "),
  shortVideoStoryboard: (headline: string) =>
    [
      "6-12 second real estate promo video",
      "Opening hero shot",
      "Interior lifestyle sequence",
      "Closing CTA",
      `Headline: ${headline}`
    ].join(" | ")
};
