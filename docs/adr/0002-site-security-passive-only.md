# Site security: no public listing of named Sites, passive scans only

Site security warns users about bookmarked Sites that report vulnerable or end-of-life software. A public, searchable list of vulnerable Sites was proposed to drive signups, but it would hand attackers a ready-made target list and expose BookmarkLand to legal and reputational risk for publishing about sites whose owners never agreed. We decided: Risk levels appear only inside the signed-in app and in a one-Site-at-a-time Site check (which reveals nothing beyond what any visitor's browser receives); public pages show aggregate totals only; Sites carry no user ids; and a Site scan is one ordinary homepage request that reads what the site already reports — never a probe, port scan or exploit attempt.

## Considered Options

- Public searchable list of vulnerable Sites — rejected as a target list.
- Public pages only for owner-verified Sites (DNS TXT or `.well-known` file), opt-in — dropped for v1; it is the safe path if Site owners later ask for public status pages, badges or alerts.
- Active checks (probing known-vulnerable endpoints) for higher accuracy — rejected; it crosses from observing to testing systems we have no authorization for.
