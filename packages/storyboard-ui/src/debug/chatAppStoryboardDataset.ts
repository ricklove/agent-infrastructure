import type { StoryboardGridSequence } from "../StoryboardGrid"

export type StoryOutlineStep = {
  kind: "step" | "verify" | "branch"
  text: string
}

export type StoryOutline = {
  id: string
  title: string
  steps: StoryOutlineStep[]
}

export type StoryboardDocument = {
  id: string
  title: string
  stories: StoryOutline[]
}

function story(id: string, title: string, steps: string[], verify: string, branches: string[] = []): StoryOutline {
  return {
    id,
    title,
    steps: [
      ...steps.map((text) => ({ kind: "step" as const, text })),
      { kind: "verify" as const, text: verify },
      ...branches.map((text) => ({ kind: "branch" as const, text })),
    ],
  }
}

export const chatAppStoryboardDocuments: StoryboardDocument[] = [
  {
    id: "account-access-and-onboarding",
    title: "Account Access And Onboarding",
    stories: [
      story(
        "create-account-with-phone-number",
        "Create account with phone number",
        [
          "Open app for first time",
          "Enter phone number",
          "System: Send verification code",
          "Enter verification code",
          "Set display name and profile photo",
        ],
        "User lands in empty inbox with account created",
        [
          "Invalid code -> show retry and resend options",
          "Phone already in use -> prompt sign-in or recovery",
        ],
      ),
      story(
        "sign-in-on-existing-account",
        "Sign in on existing account",
        [
          "Open app",
          "Enter phone number or email",
          "System: Request verification or password",
          "Complete challenge",
        ],
        "User lands in inbox with prior chats restored",
        [
          "Suspicious login -> require extra verification",
          "Too many failed attempts -> temporary lockout",
        ],
      ),
      story(
        "recover-account-after-device-loss",
        "Recover account after device loss",
        [
          "Choose account recovery",
          "Confirm identity with backup factor",
          "System: revoke old session tokens",
          "Re-enter app on new device",
        ],
        "Account access restored and old device is signed out",
        ["No backup factor -> route to manual recovery flow"],
      ),
      story(
        "complete-guided-onboarding",
        "Complete guided onboarding",
        [
          "Review privacy, contacts, and notification prompts",
          "Grant or skip permissions",
          "System: seed suggested contacts and starter tips",
        ],
        "Onboarding ends with clear next actions",
        ["Skip contacts permission -> show manual invite/import option"],
      ),
    ],
  },
  {
    id: "contacts-and-discovery",
    title: "Contacts And Discovery",
    stories: [
      story(
        "import-contacts-from-device",
        "Import contacts from device",
        [
          "Open contacts tab",
          "Allow contacts permission",
          "System: match phone contacts to users",
        ],
        "Matched contacts appear with invite options for unmatched contacts",
        ["Permission denied -> show manual search and invite path"],
      ),
      story(
        "search-for-a-person-by-username",
        "Search for a person by username",
        [
          "Open global search",
          "Enter exact or partial username",
          "System: show matching users",
          "Open selected profile",
        ],
        "User can start a new conversation from the profile",
        ["No results -> show invite/share option"],
      ),
      story(
        "block-a-known-spam-contact",
        "Block a known spam contact",
        [
          "Open contact profile",
          "Choose block",
          "Confirm block action",
          "System: remove conversation from active inbox and prevent new messages",
        ],
        "Blocked user cannot message or call",
        ["User also reports account -> create abuse report"],
      ),
      story(
        "invite-a-friend-who-is-not-yet-on-the-app",
        "Invite a friend who is not yet on the app",
        [
          "Open contacts",
          "Select unmatched contact",
          "Send invite link through system share sheet",
        ],
        "Invite is sent and pending status is visible",
      ),
    ],
  },
  {
    id: "direct-messaging-and-message-states",
    title: "Direct Messaging And Message States",
    stories: [
      story(
        "start-a-new-one-to-one-conversation",
        "Start a new one-to-one conversation",
        [
          "Open new chat composer",
          "Select contact",
          "Type first message",
          "Send",
          "System: create thread and deliver message",
        ],
        "New chat appears at top of inbox with sent message preview",
        ["Recipient privacy settings disallow first message -> show request or follow gate"],
      ),
      story(
        "send-text-message-with-delivery-states",
        "Send text message with delivery states",
        [
          "Open existing chat",
          "Type message",
          "Send",
          "System: show sending, sent, delivered, seen states",
        ],
        "Message state updates in order",
        ["Network lost during send -> retain message with retry state"],
      ),
      story(
        "edit-a-recent-message",
        "Edit a recent message",
        [
          "Long-press own message",
          "Choose edit",
          "Update text",
          "Save",
          "System: replace content and mark as edited",
        ],
        "Edited label is visible and latest content syncs on all devices",
        ["Edit window expired -> disable edit and show reason"],
      ),
      story(
        "reply-to-a-specific-message",
        "Reply to a specific message",
        [
          "Long-press message",
          "Choose reply",
          "Type response",
          "Send",
        ],
        "Sent message shows quoted context linked to original",
        ["Original message deleted -> reply shows unavailable reference state"],
      ),
      story(
        "forward-a-message-to-another-chat",
        "Forward a message to another chat",
        [
          "Select message",
          "Choose forward",
          "Pick one or more chats",
          "Confirm send",
        ],
        "Forwarded indicator is shown in destination chats",
        ["Destination disallows forwarding -> block send for that target"],
      ),
      story(
        "delete-a-sent-message",
        "Delete a sent message",
        [
          "Long-press own message",
          "Choose delete for me or delete for everyone",
          "Confirm",
          "System: remove or tombstone message as allowed",
        ],
        "Conversation updates consistently for affected participants",
        ["Delete-for-everyone window expired -> only local delete available"],
      ),
      story(
        "react-to-a-message",
        "React to a message",
        [
          "Long-press or hover message",
          "Pick reaction",
          "System: update reaction count and participant list",
        ],
        "Reaction appears without altering message order",
        ["Message removed before reaction sync -> reaction fails gracefully"],
      ),
    ],
  },
  {
    id: "inbox-and-message-management",
    title: "Inbox And Message Management",
    stories: [
      story(
        "triage-unread-chats-from-inbox",
        "Triage unread chats from inbox",
        [
          "Open inbox",
          "Review unread badges and previews",
          "Open most recent unread chat",
          "System: clear unread badge when read threshold is reached",
        ],
        "Chat ordering updates based on latest activity",
        ["Read receipts disabled -> unread clearing still works locally"],
      ),
      story(
        "pin-an-important-conversation",
        "Pin an important conversation",
        [
          "Open chat actions",
          "Choose pin",
          "System: move conversation into pinned region",
        ],
        "Pinned chat stays above unpinned chats",
        ["Pin limit reached -> require unpinning another chat"],
      ),
      story(
        "archive-a-conversation",
        "Archive a conversation",
        [
          "Swipe chat row",
          "Choose archive",
          "System: move chat out of main inbox",
        ],
        "Archived chat is hidden from default inbox",
        ["New incoming message in archived chat -> return to inbox or remain archived per setting"],
      ),
      story(
        "mute-a-noisy-conversation",
        "Mute a noisy conversation",
        [
          "Open conversation settings",
          "Choose mute duration",
          "Save",
        ],
        "Mute badge appears and notifications stop for selected duration",
        ["Mentions override mute -> only mention notifications still appear"],
      ),
    ],
  },
  {
    id: "groups-and-communities",
    title: "Groups And Communities",
    stories: [
      story(
        "create-a-group-chat",
        "Create a group chat",
        [
          "Open new group flow",
          "Select members",
          "Enter group name and photo",
          "Create group",
          "System: send group creation event to members",
        ],
        "Group appears in inbox with member list and creator as admin",
        ["Invited member privacy blocks group adds -> mark as pending invite"],
      ),
      story(
        "rename-and-customize-a-group",
        "Rename and customize a group",
        [
          "Open group settings",
          "Change name, photo, and description",
          "Save",
        ],
        "System message records the changes",
        ["Non-admin attempts edit -> action denied"],
      ),
      story(
        "add-and-remove-group-members",
        "Add and remove group members",
        [
          "Open member management",
          "Add new member",
          "Remove disruptive member",
          "System: update membership and permissions",
        ],
        "Membership list and system events reflect both changes",
        ["Removed member had pending invite acceptance on another device -> invalidate it"],
      ),
      story(
        "handle-join-via-invite-link",
        "Handle join via invite link",
        [
          "Open invite link",
          "Preview group details",
          "Join group",
          "System: validate link and membership rules",
        ],
        "User enters group and sees recent allowed history",
        [
          "Link expired -> show invalid link state",
          "Admin approval required -> place user in pending state",
        ],
      ),
      story(
        "post-in-announcement-only-channel",
        "Post in announcement-only channel",
        [
          "Open announcement space",
          "Member attempts to type message",
          "System: disable composer for non-admins",
        ],
        "Non-admin sees read-only explanation",
        ["Admin posts update -> all members receive announcement notification"],
      ),
      story(
        "manage-threaded-replies-in-a-community-channel",
        "Manage threaded replies in a community channel",
        [
          "Open channel message",
          "Reply in thread",
          "System: create side-thread and keep channel timeline clean",
        ],
        "Thread reply count updates on parent message",
        ["Thread locked by moderator -> disable reply"],
      ),
    ],
  },
  {
    id: "media-files-and-shared-content",
    title: "Media, Files, And Shared Content",
    stories: [
      story(
        "send-photo-from-gallery",
        "Send photo from gallery",
        [
          "Open attachment picker",
          "Select photo",
          "Add optional caption",
          "Send",
          "System: upload media and send placeholder until complete",
        ],
        "Image appears inline with upload progress and final thumbnail",
        ["Upload fails -> show retry on media tile"],
      ),
      story(
        "capture-and-send-quick-camera-photo",
        "Capture and send quick camera photo",
        [
          "Open camera in composer",
          "Capture photo",
          "Annotate or crop",
          "Send",
        ],
        "Captured media is inserted into chat immediately",
        ["Camera permission denied -> route to system settings or gallery fallback"],
      ),
      story(
        "send-a-document-file",
        "Send a document file",
        [
          "Open attachments",
          "Select file",
          "Send",
          "System: upload and virus-scan if applicable",
        ],
        "File tile shows name, size, and download action",
        [
          "File too large -> reject before upload",
          "Prohibited file type -> block send with explanation",
        ],
      ),
      story(
        "browse-shared-media-in-a-chat",
        "Browse shared media in a chat",
        [
          "Open chat details",
          "Open shared media tab",
          "Filter by photos, videos, links, files",
        ],
        "Shared content is grouped and searchable",
        ["Media deleted from thread -> remove from shared media view"],
      ),
    ],
  },
  {
    id: "voice-notes-calls-and-cross-device",
    title: "Voice Notes, Calls, And Cross-Device",
    stories: [
      story(
        "record-and-send-voice-note",
        "Record and send voice note",
        [
          "Hold microphone button",
          "Record short message",
          "Release to send",
          "System: encode audio and attach waveform",
        ],
        "Recipient sees playable voice note with duration",
        ["Swipe to cancel before release -> discard recording"],
      ),
      story(
        "start-a-voice-call-from-chat",
        "Start a voice call from chat",
        [
          "Open chat",
          "Tap voice call",
          "System: ring recipient and show call state",
        ],
        "Active call UI appears when recipient answers",
        [
          "Recipient unavailable -> show missed call outcome",
          "Recipient blocks calls -> action denied",
        ],
      ),
      story(
        "escalate-voice-call-to-video-call",
        "Escalate voice call to video call",
        [
          "In active voice call, choose video",
          "System: request camera permission and send upgrade prompt",
        ],
        "Both participants transition to video layout when accepted",
        ["Recipient declines video -> remain on voice call"],
      ),
      story(
        "rejoin-interrupted-call-on-another-device",
        "Rejoin interrupted call on another device",
        [
          "Call drops on mobile",
          "Open same chat on desktop",
          "Choose rejoin ongoing call",
          "System: migrate active session",
        ],
        "Call resumes on desktop and mobile leaves call",
        ["Meeting ended before rejoin -> show call ended state"],
      ),
      story(
        "link-desktop-app-to-mobile-account",
        "Link desktop app to mobile account",
        [
          "Open linked devices on phone",
          "Scan QR on desktop",
          "Confirm link",
          "System: establish new trusted device session",
        ],
        "Desktop inbox loads with synced conversations",
        ["QR expired -> refresh pairing code"],
      ),
      story(
        "revoke-one-linked-device",
        "Revoke one linked device",
        [
          "Open linked devices list",
          "Select old laptop",
          "Remove device",
          "System: revoke session token and clear encrypted session keys",
        ],
        "Old device is signed out immediately",
        ["Device currently active in call -> end that session cleanly"],
      ),
      story(
        "continue-draft-message-across-devices",
        "Continue draft message across devices",
        [
          "Type unsent draft on phone",
          "Open same chat on desktop",
          "System: sync draft if enabled",
        ],
        "Draft appears once and stays editable",
        ["Conflicting drafts on both devices -> show merge or keep-latest behavior"],
      ),
    ],
  },
  {
    id: "notifications-search-reliability-safety-settings-payments-admin",
    title: "Notifications, Search, Reliability, Safety, Settings, Payments, And Admin",
    stories: [
      story(
        "receive-push-notification-for-direct-message",
        "Receive push notification for direct message",
        [
          "App is backgrounded",
          "New message arrives",
          "System: send push with sender and preview per privacy setting",
        ],
        "Tapping notification opens correct chat",
        ["Preview hidden on lock screen -> notification omits message body"],
      ),
      story(
        "handle-mention-notification-in-muted-group",
        "Handle mention notification in muted group",
        [
          "Mute group",
          "Another member mentions user",
          "System: override mute for mention if enabled",
        ],
        "User gets mention notification but not general message spam",
        ["Mention overrides disabled -> no push delivered"],
      ),
      story(
        "snooze-notifications-across-the-app",
        "Snooze notifications across the app",
        [
          "Open notification settings",
          "Choose do not disturb interval",
          "Save",
        ],
        "Non-critical pushes stop until interval ends",
        ["Starred contacts bypass do not disturb -> only priority messages notify"],
      ),
      story(
        "search-within-a-specific-chat",
        "Search within a specific chat",
        [
          "Open chat search",
          "Enter keyword",
          "System: show matching messages with surrounding context",
          "Jump to selected result",
        ],
        "App lands at exact message location",
        ["Message falls in unloaded history -> fetch older segment before jumping"],
      ),
      story(
        "search-globally-across-people-and-messages",
        "Search globally across people and messages",
        [
          "Open global search",
          "Enter phrase",
          "System: return mixed results for contacts, groups, and messages",
        ],
        "Results are grouped by type with clear destination actions",
        ["No results -> show recent searches and suggestions"],
      ),
      story(
        "find-attachments-by-type",
        "Find attachments by type",
        [
          "Open search filters",
          "Choose photos or files",
          "Apply query",
        ],
        "Results narrow to attachment matches only",
      ),
      story(
        "compose-and-send-while-offline",
        "Compose and send while offline",
        [
          "Lose network connection",
          "Open existing chat",
          "Type and send message",
          "System: queue message locally",
        ],
        "Message remains visible with pending status",
        ["User edits or deletes queued message before reconnect -> queue updates correctly"],
      ),
      story(
        "recover-after-reconnect",
        "Recover after reconnect",
        [
          "Network returns",
          "System: flush queued actions in order",
        ],
        "Pending messages resolve to sent or failed states without duplication",
        ["One queued message conflicts or fails -> isolate failure without blocking later items"],
      ),
      story(
        "sync-read-state-across-devices",
        "Sync read state across devices",
        [
          "Read chat on desktop",
          "Open same inbox on phone",
          "System: sync latest read position and unread counts",
        ],
        "Phone reflects read state without reopening the chat",
        ["Offline secondary device -> sync on next reconnect"],
      ),
      story(
        "handle-message-history-backfill",
        "Handle message history backfill",
        [
          "Scroll to older messages",
          "System: fetch older history page",
        ],
        "Timeline expands without jumping current scroll position",
        ["History retention limit reached -> show start-of-history marker"],
      ),
      story(
        "report-abusive-direct-message",
        "Report abusive direct message",
        [
          "Open message actions",
          "Choose report",
          "Select abuse reason",
          "Submit",
          "System: file moderation report and offer block option",
        ],
        "Report confirmation is shown and user can block immediately",
        ["User also deletes conversation -> report still persists"],
      ),
      story(
        "restrict-unknown-message-requests",
        "Restrict unknown message requests",
        [
          "Unknown sender starts conversation",
          "System: route it into message requests instead of main inbox",
        ],
        "Sender cannot see read status until request accepted",
        ["Recipient declines request -> conversation is blocked from further delivery"],
      ),
      story(
        "moderate-harmful-content-in-group",
        "Moderate harmful content in group",
        [
          "Member posts prohibited media",
          "Moderator opens admin actions",
          "Remove message",
          "Warn or remove member",
          "System: log moderation event",
        ],
        "Content disappears for all members and moderation action is recorded",
        ["Moderator lacks permission -> action denied"],
      ),
      story(
        "handle-user-appeal-after-automated-restriction",
        "Handle user appeal after automated restriction",
        [
          "Account is temporarily restricted",
          "User opens restriction notice",
          "Submit appeal",
          "System: create review case and limit affected features",
        ],
        "User sees clear restriction scope and appeal status",
      ),
      story(
        "update-profile-and-presence",
        "Update profile and presence",
        [
          "Open profile settings",
          "Change display name, photo, bio, status",
          "Save",
        ],
        "Profile changes appear to contacts according to privacy settings",
      ),
      story(
        "manage-privacy-controls",
        "Manage privacy controls",
        [
          "Open privacy settings",
          "Set who can see last seen, profile photo, read receipts, and online state",
          "Save",
        ],
        "Privacy changes take effect immediately on other accounts",
        ["Incompatible combination -> explain resulting visibility"],
      ),
      story(
        "customize-chat-appearance",
        "Customize chat appearance",
        [
          "Open appearance settings",
          "Choose theme, font size, and chat wallpaper",
          "Save",
        ],
        "Inbox and chat surfaces update without affecting message content",
        ["Per-chat theme enabled -> only selected chat changes"],
      ),
      story(
        "export-account-data",
        "Export account data",
        [
          "Open account settings",
          "Request data export",
          "System: prepare downloadable archive asynchronously",
        ],
        "User receives completion notice and secure download link",
        ["Archive expires before download -> allow regeneration"],
      ),
      story(
        "send-money-in-direct-chat",
        "Send money in direct chat",
        [
          "Open payment action",
          "Enter amount and note",
          "Confirm with authentication",
          "System: process transfer and post payment event in chat",
        ],
        "Both users see payment status and receipt details",
        [
          "Insufficient balance -> prompt top-up or cancel",
          "Recipient not eligible -> block payment and explain",
        ],
      ),
      story(
        "request-payment-in-group-expense-thread",
        "Request payment in group expense thread",
        [
          "Open group payment request",
          "Split amount among selected members",
          "Send request",
          "System: create payment cards per participant",
        ],
        "Each participant sees their owed amount and payment status",
        ["Partial payments received -> status updates per member"],
      ),
      story(
        "create-organization-workspace-for-support-team",
        "Create organization workspace for support team",
        [
          "Open admin console",
          "Create workspace",
          "Add members and roles",
          "System: provision channels, policies, and audit log",
        ],
        "Invited members land in the correct workspace with role-based access",
      ),
      story(
        "enforce-retention-policy",
        "Enforce retention policy",
        [
          "Admin opens compliance settings",
          "Set message retention window",
          "Save",
          "System: schedule archival or deletion policy",
        ],
        "Policy is visible and applies to new and eligible historical content",
        ["Legal hold enabled -> exempt protected conversations"],
      ),
      story(
        "review-audit-log-for-moderation-event",
        "Review audit log for moderation event",
        [
          "Open admin audit log",
          "Filter by member and action type",
          "Open event details",
        ],
        "Admin can see who acted, when, and on which conversation",
      ),
      story(
        "join-app-connect-with-friend-and-send-first-media-message",
        "Join app, connect with friend, and send first media message",
        [
          "Create account",
          "Import contacts",
          "Find matched friend",
          "Start chat",
          "Send text, then photo",
        ],
        "First-time user reaches a successful rich conversation quickly",
        ["Contacts denied -> complete journey through manual search"],
      ),
      story(
        "handle-noisy-community-and-escalate-to-moderation",
        "Handle noisy community and escalate to moderation",
        [
          "Join public group via invite link",
          "Receive excessive notifications",
          "Mute group",
          "Encounter abusive post",
          "Report content and block offender",
        ],
        "User regains control without losing access to the group",
      ),
      story(
        "continue-conversation-across-phone-and-desktop-with-network-loss",
        "Continue a conversation across phone and desktop with network loss",
        [
          "Start chat on phone",
          "Go offline and queue message",
          "Reconnect",
          "Link desktop",
          "Continue conversation on desktop",
        ],
        "Messages, drafts, and read state remain consistent across the handoff",
      ),
    ],
  },
]

export function chatAppLargeGridSequences(): StoryboardGridSequence[] {
  return chatAppStoryboardDocuments.flatMap((document, documentIndex) =>
    document.stories.map((entry, storyIndex) => ({
      id: entry.id,
      title: `${documentIndex + 1}.${storyIndex + 1} ${document.title}`,
      frames: [
        {
          id: `${entry.id}-title`,
          title: entry.title,
          nextLabel: entry.steps.length > 0 ? "Start" : undefined,
        },
        ...entry.steps.map((step, stepIndex) => ({
          id: `${entry.id}-step-${stepIndex}`,
          title:
            step.kind === "verify"
              ? `Verify: ${step.text}`
              : step.kind === "branch"
                ? `Branch: ${step.text}`
                : step.text,
          nextLabel:
            stepIndex < entry.steps.length - 1 ? "Next" : undefined,
        })),
      ],
    })),
  )
}
