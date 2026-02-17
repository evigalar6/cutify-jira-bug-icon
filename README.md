# Hello Kitty Bug Replacer

A Chrome extension that replaces Jira bug icons with a Hello Kitty icon and shows a heart splash animation when users hover over issue-type icons.

## Features

- Replaces common Jira bug icon variants (`img`, `i`, `span`) with a custom Hello Kitty image.
- Preserves click-through behavior by storing and opening the original target URL.
- Adds contextual hover effects:
  - Normal issue icons: pink hearts (`♥`)
  - Disabled/locked contexts: broken hearts (`💔`)
- Watches dynamic DOM changes with a `MutationObserver` so newly rendered Jira rows are processed automatically.

## Project Structure

- `manifest.json`: Chrome extension metadata and loading rules (Manifest V3)
- `content.js`: DOM scanning, icon replacement, hover/click event handling, and mutation observation
- `style.css`: icon styling and heart animation keyframes
- `images/hello_kitty.png`: replacement icon used by the extension and extension action icon

## How It Works

1. The content script runs on page idle.
2. Known Jira bug-icon selectors are scanned.
3. Matching elements are marked and replaced visually with `images/hello_kitty.png`.
4. Event listeners are attached depending on the element context:
   - Direct icon hover
   - Tooltip-wrapped disabled button
   - Non-editable issue-type wrapper
   - Issue-line-card wrapper
5. Heart particles are spawned in a temporary overlay container and cleaned up after animation.
6. DOM changes are observed; newly added matching nodes are processed again.

## Installation (Developer Mode)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this repository folder.

## Usage

- Open Jira pages where issue-type bug icons are shown.
- Hover over replaced icons to see the splash animation.
- Click a replaced icon to open its original target (if one existed).

## Customization

### Change replacement image

- Replace `images/hello_kitty.png` with another PNG using the same filename.
- Or update paths in:
  - `content.js` (`chrome.runtime.getURL(...)`)
  - `manifest.json` (`icons` and `web_accessible_resources`)

### Adjust animation behavior

- In `content.js`:
  - `HEART_TYPE_NORMAL` / `HEART_TYPE_BROKEN`
  - Heart count (`5 + Math.floor(Math.random() * 3)`)
  - Particle travel distance (`20 + Math.random() * 20`)
- In `style.css`:
  - `.heart { font-size: ... }`
  - `@keyframes splash` duration and transform

### Tune matching selectors

- Update `BUG_ICON_SELECTORS` in `content.js` for Jira versions/themes with different markup.

## Notes and Limitations

- The extension currently matches `<all_urls>` for broad compatibility; production hardening should scope this to Jira domains.
- Jira UI markup can vary across versions and deployments, so selectors may need periodic updates.
- The script is intentionally defensive around duplicate listeners and dynamically inserted nodes.

## Development

- No build step is required.
- Edit files directly, then reload the extension in `chrome://extensions`.

## License

No license file is currently included. Add one if you plan to distribute or share this project.
