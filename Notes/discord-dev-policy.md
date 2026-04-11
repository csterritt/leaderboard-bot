# Discord Developer Policy — Summary

**Effective date:** July 8, 2024  
**Last updated:** June 6, 2024  
**Source:** <https://support-dev.discord.com/hc/en-us/articles/8563934450327>

This policy is incorporated into the [Discord Developer Terms of Service](https://dis.gd/discord-developer-terms-of-service). Violations may result in enforcement actions under Developer Terms Section 9.

---

## Monetization Requirements

- All monetized Applications must follow Discord's Monetization Terms and [Monetization Policy](https://support.discord.com/hc/en-us/articles/10575066024983-Server-Monetization-Policy).
- Starting October 7, 2024, in regions where Discord supports Premium Apps:
  - Paid features/capabilities **must** be purchasable through Discord's Premium Apps products.
  - Prices on Discord **must not be higher** than prices offered through other payment options.
- "Paid features or capabilities" includes subscriptions, one-time purchases, gated content, etc. Only offerings supported by Premium Apps are subject to these requirements; developers get reasonable time to implement new offering types as they become available.

---

## Protect Discord Users

1. **No unauthorized account modifications** — Must get explicit permission from the user before making any changes to their Discord account (e.g., adding to a server).
2. **No unauthorized processes** — Must obtain permission before initiating processes on a user's or server's behalf. Permission options must be clearly labeled with accurate descriptions.
3. **No circumventing safety/privacy features** — Must respect user opt-outs, blocks, and ability to remove the Application from servers/channels.
4. **No soliciting credentials** — Never request or attempt to obtain passwords, login tokens, or other account credentials from Discord users.
5. **No unsolicited contact** — Do not DM users without explicit permission. Messages must be directly related to maintaining/improving Application functionality.
6. **No advertising/marketing** — Messaging must be relevant to Application function; no unrelated material.
7. **No off-platform contact** — Do not contact Discord users outside Discord using API Data or data obtained/inferred through your Application.

---

## Respect Our Platform Rules

8. **No dangerous/illegal activity** — Including physical safety risks, environmental damage, financial scams, illegal gambling.
9. **No targeting users under 13** — Applications must not target people below the minimum age (13 or local law minimum). Applications must be properly content-rated as required by law or Discord, with ratings displayed clearly before authorization/use.
10. **No violating Community Guidelines** — You're responsible for ensuring your Application isn't used to violate Terms. Prohibited behaviors include:
    - Enabling creation of illegal media (CSAM, non-consensual pornography).
    - Distributing adult content to users under 18, or without age-restricted labels to users 18+.
    - Unless labeled age-restricted, Application must be appropriate for users under 18 and comply with applicable laws.
    - Enabling/promoting/organizing harassment (on- or off-platform).
11. **No violent/extremist content** — Including in Application Settings fields in the Developer Portal.
12. **No impersonation** — Don't impersonate other Applications, Discord employees/partners, or Discord services. Clearly labeled satire/parody/fan accounts are allowed.
13. **No engagement manipulation** — No inflating server membership with bots, no automating messages to fake activity.
14. **No evading enforcement** — Developers of removed Applications may not recreate the same or substantially similar Applications.

**Additional requirements:**
- Developers must provide users a way to report issues/violations relating to the Application, and must review and act on such reports.
- Developers should use commercially reasonable efforts to be available for feedback/user support.

---

## Handle Data with Care

15. **Use API Data only for stated functionality** — No requesting/accessing/using API Data beyond what's necessary for your Application's stated (and App Review-approved) functionality. Aggregated/de-identified data may be used to improve your Application.
16. **No profiling or discrimination** — Do not use API Data to profile users, their identities, or relationships; to discriminate based on protected characteristics; or for eligibility decisions (employment, housing, insurance, etc.).
    - Must not collect API Data from persons under 13 (or minimum legal age) or data containing protected health information, financial information, or other sensitive info — except as specifically allowed by Discord's Terms or to process financial transactions via Discord services.
17. **No disclosure to data brokers/ad networks** — Do not share API Data with data brokers, advertising networks/services, or monetization-related services.
18. **No selling/licensing API Data** — Do not commercialize API Data or Discord's services (e.g., Nitro subscriptions).
19. **No re-identification** — Do not attempt to re-identify, de-anonymize, unencrypt, reverse hash, or reverse engineer API Data from the form in which you received it.
20. **No mining/scraping** — Do not mine or scrape data/content from Discord services.
21. **No training AI/ML on message content** — Do not use message content from the APIs to train ML/AI models (including LLMs) unless Discord grants express permission.

**Note:** Developers must notify Discord and affected users of unauthorized API Data access (per Developer Terms Section 5). These policies apply in addition to the Developer Terms data provisions (including Section 5).

---

## API Limits

- Discord sets and enforces API usage limits (e.g., request counts, user counts) at its sole discretion.
- You must not attempt to circumvent these limits.
- To use any API beyond set limits, you must obtain Discord's express written consent. Discord may decline or condition approval on additional terms/charges.
