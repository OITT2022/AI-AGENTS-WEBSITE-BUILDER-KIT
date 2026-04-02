---
description: Generate a smart real estate ad package for a property
argument-hint: [propertyId] [channel]
allowed-tools: Bash(npm run create-ad -- --propertyId=$1 --channel=$2)
---

# /create-ad

Generate a full creative package for property `$1` targeting channel `$2`.

Steps:
1. Validate environment configuration.
2. Fetch property data.
3. Generate Hebrew marketing copy plus optional English variant.
4. Produce enhanced image prompts.
5. Create image/video assets.
6. Fill Canva template.
7. Return output URLs and publish payload.

If channel is omitted, default to `instagram`.
