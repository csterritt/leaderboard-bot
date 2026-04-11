# Privacy Policy

**Effective date:** April 11, 2026

Leaderboard Bot ("the Bot", "we", "us", "our") respects your privacy. This Privacy Policy describes what data the Bot collects, how it is used, and how you can request its removal.

## 1. What Data We Collect

The Bot observes messages in Discord channels that server administrators have designated as "monitored channels." When a user posts a message containing a music attachment in a monitored channel, the Bot records **references** to that activity. Specifically, the Bot stores:

- **User statistics** — Discord user ID, username, the channel ID, the timestamp of the most recent music post, a current streak count ("run count"), and the highest streak seen. This data is keyed per channel per user.
- **Processed message IDs** — Discord message IDs and channel IDs of messages the Bot has already counted, to prevent double-counting.
- **Leaderboard post references** — The Discord message ID and a content hash of the Bot's own leaderboard posts, so the Bot can update them in place.
- **Channel configuration** — Which channels are monitored and which channels display leaderboards, along with the Discord guild (server) ID and the user ID of the server member who configured the channel.

**The Bot does not store message content, file contents, or any text from user messages.** It only stores references (IDs) and aggregate statistics derived from the presence of music attachments.

## 2. How We Use Data

All data is used **solely** to provide the Bot's core functionality:

- Tracking music-sharing streaks in monitored channels.
- Generating and updating leaderboard displays.
- Preventing duplicate counting of already-processed messages.
- Recovering missed activity after Bot restarts.

We do not use this data for advertising, profiling, marketing, or any purpose unrelated to the Bot's stated functionality. We do not sell, license, or share this data with third parties.

## 3. Data Retention

Data is retained as long as the Bot is actively serving the relevant channel. If a monitored channel or leaderboard is removed from the Bot's configuration, associated data is deleted.

## 4. Your Right to Data Removal

**You may request deletion of your data at any time.** If you are a Discord user whose data has been recorded by the Bot, you can elect to have your data removed by:

- Contacting the Bot developer through the Bot's support channels or Discord profile.
- Requesting that the server administrator remove the Bot or the monitored channel configuration associated with your data.

Upon receiving a verified deletion request, we will promptly delete all user statistics and processed message references associated with your Discord user ID from our database.

## 5. Data Security

We use commercially reasonable efforts to protect stored data from unauthorized access, including encryption of developer credentials and access tokens. The Bot's database is not publicly accessible.

## 6. Third-Party Services

The Bot operates within Discord's platform and is subject to Discord's own privacy practices. We encourage you to review [Discord's Privacy Policy](https://discord.com/privacy). We do not share your data with any other third parties.

## 7. Children's Privacy

The Bot is not directed at children under the age of 13. We do not knowingly collect data from children under 13. If we become aware that we have inadvertently stored data from a user under 13, we will promptly delete it.

## 8. Changes to This Policy

We may update this Privacy Policy from time to time. Continued use of the Bot after changes take effect constitutes acceptance of the revised policy. Significant changes will be communicated through the Bot's support channels.

## 9. Contact

For data deletion requests or questions about this Privacy Policy, you may contact the Bot developer through the Bot's support channels or Discord profile.
