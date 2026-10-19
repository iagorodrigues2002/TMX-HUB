# Security remediation boundaries

Approved scope: harden the source-grounded audit leads without changing valid
integration payloads, destinations, event naming, attribution rules, retries or
provider dispatch. No production access, replay, test send, migration execution
or deployment is authorized in this work.

Use narrowly scoped guards at the last trusted decision point:

- Fence browser mutation callbacks by session generation.
- Atomically create accounts and consume invitations; atomically reserve the
  first administrator only when the user store is still empty.
- Do not let unverified headers choose request quota identities.
- Limit offer-owned reconciliation to offer destinations. Restrict global
  gateway routing claims to administrators.
- Treat public analytics as observations, not authority to replace buyer
  identities. Bind compatibility queries to configured stage destinations.
- Enforce public-address policy at connection time for untrusted URL tools,
  including redirects, with bounded graph downloads and cancellation.
- Await all paired media downloads before cleaning up every successful result.

Preserve existing public analytics receipt and valid owner workflows. Leave
historical data untouched. Record any item whose safe correction would require
changing integration behavior rather than silently expanding the scope.

Validation must use dummy users, isolated local services or inert transports in
an OS-enforced offline sandbox. Keep the original audit immutable: source changes
do not turn its pending leads into retrospectively confirmed vulnerabilities.
