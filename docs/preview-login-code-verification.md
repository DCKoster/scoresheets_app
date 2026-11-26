# Login-code preview verification

On November 26, 2026, the migration preserved three preview accounts, seven groups, 16 memberships, nine matches, 18 participants and 16 sync receipts. The owner recovered the existing account and issued codes to both existing members. The local and preview API and browser checks covered username sign-in, owner-only issuance, adding an existing account to a group, code replacement, session revocation, owner recovery, offline replay, account and group isolation, and revision conflicts. The temporary owner recovery binding was removed from the active preview, and version URLs were disabled.

## Cloudflare Workers Free CPU

The final preview build used version `1a854e84-e79b-4f2f-9a83-789299b76ddf`. Workers invocation logs were joined to API and browser requests by Cloudflare Ray ID. A cold sample was the first logged invocation of a newly deployed version of the same build. The remaining samples used the active preview version after its first invocation. Offline replay was measured in the browser after the app refreshed the account and group list. The large round request was 116,920 bytes and the large race request was 26,476 bytes. CPU is reported in milliseconds. The p95 uses the nearest rank.

| Request | Invocation | Samples | Median (ms) | p95 (ms) | Max (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| Code issuance | cold | 2 | 5.5 | 6 | 6 |
| Code issuance | warm | 4 | 2.5 | 5 | 5 |
| Username sign-in | cold | 1 | 2 | 2 | 2 |
| Username sign-in | warm | 5 | 1 | 2 | 2 |
| Typical four-player match | cold | 1 | 12 | 12 | 12 |
| Typical four-player match | warm | 5 | 5 | 8 | 8 |
| 100 rounds × 30 players × 5 categories | cold | 1 | 23 | 23 | 23 |
| 100 rounds × 30 players × 5 categories | warm | 5 | 12 | 17 | 17 |
| 100 Mario Kart races × 12 racers | cold | 1 | 12 | 12 | 12 |
| 100 Mario Kart races × 12 racers | warm | 5 | 7 | 10 | 10 |
| Duplicate retry of the large round scorecard | cold | 1 | 8 | 8 | 8 |
| Duplicate retry of the large round scorecard | warm | 5 | 6 | 11 | 11 |
| Offline queue replay in Chrome | warm | 2 | 6 | 6 | 6 |

**The preview missed the strict under-10 ms gate.** 10 of 38 samples hit or exceeded 10 ms. Large categorized round scorecards took 11–17 ms warm and 23 ms cold. A typical cold match and a cold Mario Kart scorecard each reached 12 ms. The warm Mario Kart and duplicate retry maxima were 10 ms and 11 ms. The measured requests succeeded, and Cloudflare recorded zero resource-limit errors across the 99 preview invocations in the measurement window. These results block a Workers Free production rollout under the approved criteria. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)

The first preview build reached a median of 14 ms and a maximum of 19 ms on five warm categorized round scorecards. The final build validates and totals those scores together and sends a compact representation to D1. Match history expands that representation to the existing API format and still reads older saved scorecards.

`npm run verify:cpu -- <origin> <fixture-file> <new-sample-file>` generates the HTTP workload and saves its Ray IDs. Set `SCORESHEETS_CPU_WORKLOAD` to a private file path to reuse the prepared scorecard and duplicate operation across deployments. Pass a third argument to `verify:browser` to capture the requests that replay the offline queue.
