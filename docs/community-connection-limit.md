# Evaluating the Community connection limit

The Community allowance remains five connections. This change does not alter prices, quotas, or connection authorization.

## Hypothesis

Five connections may stop educators from forming a useful professional network before they experience the value of VistaTeacher. A higher allowance could improve retention, but could also reduce upgrades or increase unsolicited requests. Neither outcome is established by this UI review or emulator data.

## Evidence needed before changing the allowance

- Measure the share of active Community accounts with 0–3, 4, and 5 accepted connections, split by account age. Use accepted relationships, rather than outgoing requests, when checking the count.
- Compare week-one and month-one return rates for these cohorts. Distinguish active conversations and reciprocal interactions from the number of connections alone.
- Measure unique educators shown the connection-limit prompt, subsequent successful connections, and upgrades. Repeated clicks by one educator should not count as independent demand.
- Record whether the cap prevents sending a new request or accepting an incoming request. These can have different effects on a community.
- Review request rejection and reporting rates, and ask educators who reach the cap whether they found enough relevant peers.

The repository's current counters and relationship records can support the connection distribution. They do not establish historical cap impressions, cohort retention, or upgrade attribution. Add first-party aggregate outcome instrumentation before drawing those conclusions; do not infer them from a billing snapshot or seeded accounts.

## Follow-up experiment

After collecting a baseline, compare the existing five-connection allowance with a 15-connection allowance for randomly assigned new Community accounts. Keep messaging, AI allowances, and pricing fixed. Run for at least one complete 30-day retention window. Decide sample size and the minimum meaningful retention improvement from the observed baseline before starting.

Prefer the larger allowance only if useful reciprocal interactions and retention improve without an unacceptable increase in reports or loss of paid conversion. Keep the assignment and enforcement server-owned. No experiment is enabled by this branch.
