console.log("Hello Kitty Bug Replacer content script loaded.");

const HELLO_KITTY_ICON_URL = chrome.runtime.getURL("images/hello_kitty.png");

const DATA_ORIGINAL_ICON = "data-original-hk-src";
const DATA_TARGET_URL = "data-hk-target-url";
const DATA_ICON_ID = "data-hk-icon-id";

const CANNOT_EDIT_BUTTON_TEST_ID = "issue-view-foundation.noneditable-issue-type.button";
const ISSUE_LINE_CARD_TEST_ID = "issue-line-card-issue-type.issue-type";

const HEART_TYPE_NORMAL = "normal";
const HEART_TYPE_BROKEN = "broken";
const HEART_COLOR_PINK = "#ff79c6";

const BUG_ICON_SELECTORS = [
  'img[alt="Bug"]',
  'img[alt*="bug"]',
  'img[alt*="Bug"]',
  'img[alt="Issue type: Bug"]',
  'img[src*="bug"]',
  'img[title*="bug"]',
  'i[class*="bug"]',
  'span[class*="bug"]',
  'img[src*="/issuetype/avatar/10303"]'
];

let currentHeartContainer = null;
let heartSplashTimeout = null;
let nextIdCounter = 0;

/**
 * Collect candidate bug icons from known Jira patterns.
 * A set is used to avoid duplicate elements from overlapping selectors.
 */
function findBugIcons() {
  const foundIcons = [];
  const seenElements = new Set();

  BUG_ICON_SELECTORS.forEach((selector) => {
    try {
      document.querySelectorAll(selector).forEach((icon) => {
        if (seenElements.has(icon)) {
          return;
        }

        const isAlreadyProcessed = icon.classList.contains("hk-bug-icon");
        const isExtensionMarkup = Boolean(icon.closest(".chrome-extension-container"));

        if (!isAlreadyProcessed && !isExtensionMarkup) {
          foundIcons.push(icon);
          seenElements.add(icon);
        }
      });
    } catch (error) {
      console.warn(`Hello Kitty Bug Replacer: selector failed: ${selector}`, error);
    }
  });

  return foundIcons;
}

function assignStableIconId(icon) {
  if (!icon.dataset.hkIconId) {
    icon.dataset.hkIconId = `hk-icon-${nextIdCounter++}`;
  }
  return icon.dataset.hkIconId;
}

function storeOriginalLink(icon) {
  const anchor = icon.closest("a");
  if (anchor && anchor.href) {
    icon.setAttribute(DATA_TARGET_URL, anchor.href);
  } else {
    icon.removeAttribute(DATA_TARGET_URL);
  }
}

/**
 * Replace the original bug icon visual while keeping element semantics.
 */
function replaceIconVisual(icon) {
  if (icon.tagName.toLowerCase() === "img") {
    if (!icon.getAttribute(DATA_ORIGINAL_ICON)) {
      icon.setAttribute(DATA_ORIGINAL_ICON, icon.src);
    }
    icon.src = HELLO_KITTY_ICON_URL;
    return;
  }

  if (!icon.getAttribute(DATA_ORIGINAL_ICON)) {
    icon.setAttribute(DATA_ORIGINAL_ICON, icon.innerHTML);
  }

  icon.innerHTML = "";
  icon.style.backgroundImage = `url(${HELLO_KITTY_ICON_URL})`;
  icon.style.backgroundSize = "contain";
  icon.style.backgroundRepeat = "no-repeat";
  icon.style.backgroundPosition = "center";

  const currentDisplay = window.getComputedStyle(icon).display;
  if (currentDisplay === "inline" || currentDisplay === "") {
    icon.style.display = "inline-block";
  }
  if (!icon.style.width || icon.style.width === "0px") {
    icon.style.width = "24px";
  }
  if (!icon.style.height || icon.style.height === "0px") {
    icon.style.height = "24px";
  }
}

function clearEventListeners(icon, context) {
  icon.removeEventListener("mouseenter", handleIconHover);
  icon.removeEventListener("mouseleave", handleIconMouseLeave);
  icon.removeEventListener("click", handleIconClick);

  const { generalTooltip, cannotEditButton, issueLineCard } = context;

  if (generalTooltip && generalTooltip.dataset.hkTooltipId) {
    generalTooltip.removeEventListener("mouseenter", handleSpecialTooltipHover);
    generalTooltip.removeEventListener("mouseleave", handleSpecialTooltipMouseLeave);
  }

  if (
    cannotEditButton &&
    cannotEditButton.parentElement &&
    cannotEditButton.parentElement.dataset.hkCannotEditWrapperId
  ) {
    cannotEditButton.parentElement.removeEventListener("mouseenter", handleCannotEditWrapperHover);
    cannotEditButton.parentElement.removeEventListener("mouseleave", handleCannotEditWrapperMouseLeave);
  }

  if (issueLineCard && issueLineCard.dataset.hkIssueLineCardId) {
    issueLineCard.removeEventListener("mouseenter", handleIssueLineCardHover);
    issueLineCard.removeEventListener("mouseleave", handleIssueLineCardMouseLeave);
  }
}

function addNormalIconListeners(icon) {
  icon.addEventListener("mouseenter", handleIconHover);
  icon.addEventListener("mouseleave", handleIconMouseLeave);
}

/**
 * Attach hover listeners according to Jira layout context.
 * Different wrappers need listeners on different DOM nodes.
 */
function configureIconListeners(icon) {
  const cannotEditButton = icon.closest(`button[disabled][data-testid="${CANNOT_EDIT_BUTTON_TEST_ID}"]`);
  const issueLineCard = icon.closest(`div[data-testid="${ISSUE_LINE_CARD_TEST_ID}"]`);
  const generalTooltip = icon.closest('[role="tooltip"]');
  const buttonInGeneralTooltip =
    generalTooltip && !cannotEditButton && !issueLineCard ? icon.closest("button[disabled]") : null;

  const context = { cannotEditButton, issueLineCard, generalTooltip };
  clearEventListeners(icon, context);
  icon.addEventListener("click", handleIconClick);

  if (cannotEditButton && cannotEditButton.contains(icon)) {
    const wrapper = cannotEditButton.parentElement;
    if (wrapper) {
      if (!wrapper.dataset.hkCannotEditWrapperId) {
        wrapper.dataset.hkCannotEditWrapperId = `hk-cew-${nextIdCounter++}`;
      }
      wrapper.dataset.hkTargetIconId = icon.dataset.hkIconId;
      wrapper.addEventListener("mouseenter", handleCannotEditWrapperHover);
      wrapper.addEventListener("mouseleave", handleCannotEditWrapperMouseLeave);
      return;
    }
  }

  if (issueLineCard && issueLineCard.contains(icon)) {
    if (!issueLineCard.dataset.hkIssueLineCardId) {
      issueLineCard.dataset.hkIssueLineCardId = `hk-ilc-${nextIdCounter++}`;
    }
    issueLineCard.dataset.hkTargetIconId = icon.dataset.hkIconId;
    issueLineCard.addEventListener("mouseenter", handleIssueLineCardHover);
    issueLineCard.addEventListener("mouseleave", handleIssueLineCardMouseLeave);
    return;
  }

  if (
    generalTooltip &&
    buttonInGeneralTooltip &&
    buttonInGeneralTooltip.disabled &&
    generalTooltip.contains(buttonInGeneralTooltip) &&
    buttonInGeneralTooltip.contains(icon)
  ) {
    if (!generalTooltip.dataset.hkTooltipId) {
      generalTooltip.dataset.hkTooltipId = `hk-tooltip-${nextIdCounter++}`;
    }
    generalTooltip.dataset.hkTargetIconId = icon.dataset.hkIconId;
    generalTooltip.addEventListener("mouseenter", handleSpecialTooltipHover);
    generalTooltip.addEventListener("mouseleave", handleSpecialTooltipMouseLeave);
    return;
  }

  addNormalIconListeners(icon);
}

function replaceIcon(icon) {
  storeOriginalLink(icon);
  assignStableIconId(icon);
  replaceIconVisual(icon);

  icon.classList.add("hk-bug-icon");
  icon.style.setProperty("object-fit", "contain", "important");

  configureIconListeners(icon);
}

function createOrGetHeartContainer(triggerElement, associatedId) {
  clearTimeout(heartSplashTimeout);

  if (currentHeartContainer && currentHeartContainer.dataset.associatedTriggerId !== associatedId) {
    currentHeartContainer.remove();
    currentHeartContainer = null;
  }

  if (!currentHeartContainer) {
    const rect = triggerElement.getBoundingClientRect();
    currentHeartContainer = document.createElement("div");
    currentHeartContainer.className = "heart-splash-container";
    currentHeartContainer.style.left = `${rect.left + window.scrollX}px`;
    currentHeartContainer.style.top = `${rect.top + window.scrollY}px`;
    currentHeartContainer.style.width = `${rect.width}px`;
    currentHeartContainer.style.height = `${rect.height}px`;
    currentHeartContainer.dataset.associatedTriggerId = associatedId;
    document.body.appendChild(currentHeartContainer);
  }

  currentHeartContainer.dataset.keepAlive = "true";
  return currentHeartContainer;
}

function createHeartsInContainer(container, baseRect, options = { type: HEART_TYPE_NORMAL }) {
  if (!container) {
    return;
  }

  const totalHearts = 5 + Math.floor(Math.random() * 3);
  const heartCharacter = options.type === HEART_TYPE_BROKEN ? "💔" : "♥";
  const heartColor = options.type === HEART_TYPE_BROKEN ? "" : HEART_COLOR_PINK;

  for (let index = 0; index < totalHearts; index += 1) {
    const heart = document.createElement("div");
    heart.className = "heart";
    heart.textContent = heartCharacter;

    if (heartColor) {
      heart.style.color = heartColor;
    }

    const startX = Math.random() * baseRect.width;
    const startY = Math.random() * baseRect.height;
    const angle = Math.random() * Math.PI * 2;
    const distance = 20 + Math.random() * 20;

    heart.style.left = `${startX}px`;
    heart.style.top = `${startY}px`;
    heart.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
    heart.style.setProperty("--ty", `${Math.sin(angle) * distance - 30}px`);

    container.appendChild(heart);
    heart.addEventListener("animationend", () => heart.remove());
  }
}

function attemptRemoveHeartContainer(triggerId) {
  if (!currentHeartContainer || currentHeartContainer.dataset.associatedTriggerId !== triggerId) {
    return;
  }

  delete currentHeartContainer.dataset.keepAlive;
  clearTimeout(heartSplashTimeout);

  heartSplashTimeout = setTimeout(() => {
    if (
      currentHeartContainer &&
      currentHeartContainer.dataset.associatedTriggerId === triggerId &&
      !currentHeartContainer.dataset.keepAlive
    ) {
      currentHeartContainer.remove();
      currentHeartContainer = null;
    }
  }, 300);
}

function handleIconHover(event) {
  const icon = event.currentTarget;
  const container = createOrGetHeartContainer(icon, icon.dataset.hkIconId);
  createHeartsInContainer(container, icon.getBoundingClientRect(), { type: HEART_TYPE_NORMAL });
}

function handleIconMouseLeave(event) {
  attemptRemoveHeartContainer(event.currentTarget.dataset.hkIconId);
}

function getTargetIconElement(targetId) {
  return document.querySelector(`[${DATA_ICON_ID}="${targetId}"]`);
}

function handleSpecialTooltipHover(event) {
  const tooltip = event.currentTarget;
  const targetIcon = getTargetIconElement(tooltip.dataset.hkTargetIconId);
  if (!targetIcon) {
    return;
  }

  const container = createOrGetHeartContainer(tooltip, tooltip.dataset.hkTooltipId);
  createHeartsInContainer(container, targetIcon.getBoundingClientRect(), { type: HEART_TYPE_BROKEN });
}

function handleSpecialTooltipMouseLeave(event) {
  attemptRemoveHeartContainer(event.currentTarget.dataset.hkTooltipId);
}

function handleCannotEditWrapperHover(event) {
  const wrapper = event.currentTarget;
  const targetIcon = getTargetIconElement(wrapper.dataset.hkTargetIconId);
  if (!targetIcon) {
    return;
  }

  const container = createOrGetHeartContainer(wrapper, wrapper.dataset.hkCannotEditWrapperId);
  createHeartsInContainer(container, targetIcon.getBoundingClientRect(), { type: HEART_TYPE_BROKEN });
}

function handleCannotEditWrapperMouseLeave(event) {
  attemptRemoveHeartContainer(event.currentTarget.dataset.hkCannotEditWrapperId);
}

function handleIssueLineCardHover(event) {
  const card = event.currentTarget;
  const targetIcon = getTargetIconElement(card.dataset.hkTargetIconId);
  if (!targetIcon) {
    return;
  }

  const container = createOrGetHeartContainer(card, card.dataset.hkIssueLineCardId);
  createHeartsInContainer(container, targetIcon.getBoundingClientRect(), { type: HEART_TYPE_NORMAL });
}

function handleIssueLineCardMouseLeave(event) {
  attemptRemoveHeartContainer(event.currentTarget.dataset.hkIssueLineCardId);
}

function handleIconClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const targetUrl = event.currentTarget.getAttribute(DATA_TARGET_URL);
  if (targetUrl) {
    window.open(targetUrl, "_blank");
  }
}

function processPage() {
  findBugIcons().forEach((icon) => {
    try {
      replaceIcon(icon);
    } catch (error) {
      console.error("Hello Kitty Bug Replacer: icon replacement failed", error, icon);
    }
  });
}

function shouldReprocessMutation(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const selectors = BUG_ICON_SELECTORS.join(",");
  return Boolean(node.matches(selectors) || node.querySelector(selectors));
}

function observeDomUpdates() {
  const observer = new MutationObserver((mutations) => {
    const needsProcessing = mutations.some(
      (mutation) =>
        mutation.type === "childList" &&
        mutation.addedNodes.length > 0 &&
        Array.from(mutation.addedNodes).some((node) => shouldReprocessMutation(node))
    );

    if (needsProcessing) {
      processPage();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

processPage();
observeDomUpdates();
console.log("Hello Kitty Bug Replacer ready.");
