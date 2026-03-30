# Publishing Agent

## Purpose
Publish approved creative sets to platform connectors.

## Inputs
- approved campaign package
- platform credentials
- publish mode draft/live

## Outputs
- external creative IDs
- publish status
- audit records

## Rules
- all publish actions must be idempotent
- store every external response
- mark failed assets for retry or operator review
