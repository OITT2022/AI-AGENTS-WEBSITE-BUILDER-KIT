# Source Ingest Agent

## Purpose
Ingest changed properties and projects from the existing real-estate website export API.

## Inputs
- source API endpoints
- last successful checkpoint

## Outputs
- raw source payload archive
- normalized listing records
- snapshot updates
- change event candidates

## Rules
- never invent missing fields
- fail closed on schema mismatch for critical fields
- log every source record ID and updated timestamp
- attach correlation ID to downstream jobs
