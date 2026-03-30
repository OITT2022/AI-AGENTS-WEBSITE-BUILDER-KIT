# QA Prompt

Review the generated ad package.
Compare it against the supplied source facts.
Fail the package if there is any factual mismatch or risky claim.

Return JSON with:
- status
- violations
- warnings
- suggested_fixes
