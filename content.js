// content.js
console.log("Hello Kitty Bug Replacer content script loaded!");

const HELLO_KITTY_ICON_URL = chrome.runtime.getURL("images/hello_kitty.png");
const ORIGINAL_ICON_SRC_KEY = 'data-original-hk-src';
const ORIGINAL_LINK_KEY = 'data-hk-target-url';
let currentHeartContainer = null;
let heartSplashTimeout = null;
let nextIdCounter = 0; 

const PINK_HEART_COLOR = '#ff79c6'; // Kept for direct color setting if needed by HEART_TYPE_NORMAL

const CANNOT_EDIT_BUTTON_TEST_ID = "issue-view-foundation.noneditable-issue-type.button";
const ISSUE_LINE_CARD_TEST_ID = "issue-line-card-issue-type.issue-type"; // New constant

const HEART_TYPE_NORMAL = 'normal';
const HEART_TYPE_BROKEN = 'broken';

// --- Icon Detection ---
function findBugIcons() {
    const selectors = [
        'img[alt="Bug"]', 'img[alt*="bug"]', 'img[alt*="Bug"]', 
        'img[alt="Issue type: Bug"]', 'img[src*="bug"]', 
        'img[title*="bug"]', 'i[class*="bug"]', 'span[class*="bug"]',
        'img[src*="/issuetype/avatar/10303"]'
    ];
    // Add more selectors here if needed based on investigation
    // For example, if the new case always has a specific class on the img or parent
    // selectors.push(`div[data-testid="${ISSUE_LINE_CARD_TEST_ID}"] img`);


    let potentialIcons = [];
    const seenElements = new Set();
    selectors.forEach(selector => {
        try {
            document.querySelectorAll(selector).forEach(icon => {
                // Ensure the icon itself isn't the issue line card div, but a child image
                if (icon.tagName.toLowerCase() === 'img' && icon.closest(`div[data-testid="${ISSUE_LINE_CARD_TEST_ID}"]`)) {
                    // If icon is inside an issue line card, ensure we are targeting the img
                    // and not accidentally processing the div itself if selectors were too broad.
                } else if (icon.matches(`div[data-testid="${ISSUE_LINE_CARD_TEST_ID}"]`)) {
                    // If the selector matched the div itself, find the image inside it.
                    // This might be needed if future selectors target the div.
                    // For now, our selectors primarily target <img>, <i>, <span>.
                    // const imgInDiv = icon.querySelector('img');
                    // if (imgInDiv) icon = imgInDiv; else return;
                }


                if (!seenElements.has(icon)) {
                    if (!icon.classList.contains('hk-bug-icon') && !icon.closest('.chrome-extension-container')) {
                        potentialIcons.push(icon);
                        seenElements.add(icon);
                    }
                }
            });
        } catch (e) {
            console.warn(`Hello Kitty Bug Replacer: Error with selector "${selector}":`, e.message);
        }
    });
    findBugIcons.selectors = selectors;
    return [...new Set(potentialIcons)];
}
// Initialize static selectors for the observer
findBugIcons.selectors = [ 
    'img[alt="Bug"]', 'img[alt*="bug"]', 'img[alt*="Bug"]', 
    'img[alt="Issue type: Bug"]', 'img[src*="bug"]', 'img[title*="bug"]',
    'i[class*="bug"]', 'span[class*="bug"]', 'img[src*="/issuetype/avatar/10303"]'
];

// --- Icon Replacement & Event Listener Logic ---
function replaceIcon(originalIcon) {
    const anchorTag = originalIcon.closest('a');
    if (anchorTag && anchorTag.href) {
        originalIcon.setAttribute(ORIGINAL_LINK_KEY, anchorTag.href);
    } else {
        originalIcon.removeAttribute(ORIGINAL_LINK_KEY);
    }

    if (!originalIcon.dataset.hkIconId) {
        originalIcon.dataset.hkIconId = `hk-icon-${nextIdCounter++}`;
    }

    if (originalIcon.tagName.toLowerCase() === 'img') {
        if (!originalIcon.getAttribute(ORIGINAL_ICON_SRC_KEY)) {
            originalIcon.setAttribute(ORIGINAL_ICON_SRC_KEY, originalIcon.src);
        }
        originalIcon.src = HELLO_KITTY_ICON_URL;
    } else {
        if (!originalIcon.getAttribute(ORIGINAL_ICON_SRC_KEY)) {
            originalIcon.setAttribute(ORIGINAL_ICON_SRC_KEY, originalIcon.innerHTML);
        }
        originalIcon.innerHTML = '';
        originalIcon.style.backgroundImage = `url(${HELLO_KITTY_ICON_URL})`;
        originalIcon.style.backgroundSize = 'contain';
        originalIcon.style.backgroundRepeat = 'no-repeat';
        originalIcon.style.backgroundPosition = 'center';
        const currentDisplay = window.getComputedStyle(originalIcon).display;
        if (currentDisplay === 'inline' || currentDisplay === '') {
             originalIcon.style.display = 'inline-block';
        }
        if (!originalIcon.style.width || originalIcon.style.width === '0px') { originalIcon.style.width = '24px'; }
        if (!originalIcon.style.height || originalIcon.style.height === '0px') { originalIcon.style.height = '24px'; }
    }

    originalIcon.classList.add('hk-bug-icon');
    originalIcon.style.setProperty('object-fit', 'contain', 'important');
    
    // --- Determine Case and Attach Listeners ---
    const cannotEditButton = originalIcon.closest(`button[disabled][data-testid="${CANNOT_EDIT_BUTTON_TEST_ID}"]`);
    const issueLineCardDiv = originalIcon.closest(`div[data-testid="${ISSUE_LINE_CARD_TEST_ID}"]`);
    const generalTooltip = originalIcon.closest('[role="tooltip"]');
    // Check if the icon is in a disabled button *within* a general tooltip that isn't part of the other more specific cases
    const buttonInGeneralTooltip = generalTooltip && !cannotEditButton && !issueLineCardDiv ? originalIcon.closest('button[disabled]') : null;


    // Clear all potential old listeners to prevent duplicates
    originalIcon.removeEventListener('mouseenter', handleIconHover);
    originalIcon.removeEventListener('mouseleave', handleIconMouseLeave);
    if (generalTooltip && generalTooltip.dataset.hkTooltipId) {
        generalTooltip.removeEventListener('mouseenter', handleSpecialTooltipHover);
        generalTooltip.removeEventListener('mouseleave', handleSpecialTooltipMouseLeave);
    }
    if (cannotEditButton && cannotEditButton.parentElement && cannotEditButton.parentElement.dataset.hkCannotEditWrapperId) {
        cannotEditButton.parentElement.removeEventListener('mouseenter', handleCannotEditWrapperHover);
        cannotEditButton.parentElement.removeEventListener('mouseleave', handleCannotEditWrapperMouseLeave);
    }
    if (issueLineCardDiv && issueLineCardDiv.dataset.hkIssueLineCardId) {
        issueLineCardDiv.removeEventListener('mouseenter', handleIssueLineCardHover);
        issueLineCardDiv.removeEventListener('mouseleave', handleIssueLineCardMouseLeave);
    }
    // Click listener is always on the icon itself
    originalIcon.removeEventListener('click', handleIconClick);
    originalIcon.addEventListener('click', handleIconClick);


    if (cannotEditButton && cannotEditButton.contains(originalIcon)) {
        const wrapperDiv = cannotEditButton.parentElement; 
        if (wrapperDiv) {
            console.log(`%cCANNOT EDIT WRAPPER case for icon ${originalIcon.dataset.hkIconId}. Attaching listeners to wrapperDiv.`, "color:crimson; font-weight:bold;");
            if (!wrapperDiv.dataset.hkCannotEditWrapperId) {
                wrapperDiv.dataset.hkCannotEditWrapperId = `hk-cew-${nextIdCounter++}`;
            }
            wrapperDiv.dataset.hkTargetIconId = originalIcon.dataset.hkIconId;
            wrapperDiv.addEventListener('mouseenter', handleCannotEditWrapperHover);
            wrapperDiv.addEventListener('mouseleave', handleCannotEditWrapperMouseLeave);
        } else { addNormalIconListeners(originalIcon); }
    } else if (issueLineCardDiv && issueLineCardDiv.contains(originalIcon)) {
        // New Case: Icon is inside an "issue-line-card-issue-type" div
        console.log(`%cISSUE LINE CARD case for icon ${originalIcon.dataset.hkIconId}. Attaching listeners to cardDiv.`, "color:darkorange; font-weight:bold;");
        if (!issueLineCardDiv.dataset.hkIssueLineCardId) {
            issueLineCardDiv.dataset.hkIssueLineCardId = `hk-ilc-${nextIdCounter++}`;
        }
        issueLineCardDiv.dataset.hkTargetIconId = originalIcon.dataset.hkIconId;
        issueLineCardDiv.addEventListener('mouseenter', handleIssueLineCardHover);
        issueLineCardDiv.addEventListener('mouseleave', handleIssueLineCardMouseLeave);
    } else if (generalTooltip && buttonInGeneralTooltip && buttonInGeneralTooltip.disabled && generalTooltip.contains(buttonInGeneralTooltip) && buttonInGeneralTooltip.contains(originalIcon)) {
        console.log(`%cGENERAL TOOLTIP DISABLED BTN case for icon ${originalIcon.dataset.hkIconId}. Attaching listeners to tooltip.`, "color: orange;");
        if (!generalTooltip.dataset.hkTooltipId) {
            generalTooltip.dataset.hkTooltipId = `hk-tooltip-${nextIdCounter++}`;
        }
        generalTooltip.dataset.hkTargetIconId = originalIcon.dataset.hkIconId;
        generalTooltip.addEventListener('mouseenter', handleSpecialTooltipHover);
        generalTooltip.addEventListener('mouseleave', handleSpecialTooltipMouseLeave);
    } else {
        addNormalIconListeners(originalIcon);
    }
    // console.log("Event listeners configured for icon:", originalIcon.dataset.hkIconId);
}

function addNormalIconListeners(icon) {
    // console.log(`%cNORMAL ICON case for icon ${icon.dataset.hkIconId}. Attaching listeners to icon.`, "color: green;");
    icon.addEventListener('mouseenter', handleIconHover);
    icon.addEventListener('mouseleave', handleIconMouseLeave);
}

// --- Heart Splash Animation & Container Logic ---
function createOrGetHeartContainer(triggerElement, associatedId) {
    clearTimeout(heartSplashTimeout);
    if (currentHeartContainer && currentHeartContainer.dataset.associatedTriggerId !== associatedId) {
        currentHeartContainer.remove();
        currentHeartContainer = null;
    }
    if (!currentHeartContainer) {
        const rect = triggerElement.getBoundingClientRect();
        currentHeartContainer = document.createElement('div');
        currentHeartContainer.className = 'heart-splash-container';
        currentHeartContainer.style.left = `${rect.left + window.scrollX}px`;
        currentHeartContainer.style.top = `${rect.top + window.scrollY}px`;
        currentHeartContainer.style.width = `${rect.width}px`;
        currentHeartContainer.style.height = `${rect.height}px`;
        currentHeartContainer.dataset.associatedTriggerId = associatedId;
        document.body.appendChild(currentHeartContainer);
    }
    currentHeartContainer.dataset.keepAlive = 'true';
    return currentHeartContainer;
}

function createHeartsInContainer(container, baseElementRect, heartOptions = { type: HEART_TYPE_NORMAL }) {
    if (!container) { console.error("No container for hearts"); return; }
    const numHearts = 5 + Math.floor(Math.random() * 3);
    let heartCharacter = '♥';
    let heartColor = PINK_HEART_COLOR;

    if (heartOptions.type === HEART_TYPE_BROKEN) {
        heartCharacter = '💔';
        heartColor = ''; 
        // console.log(`%cCreating ${numHearts} BROKEN HEARTS (💔) for trigger ${container.dataset.associatedTriggerId}`, "color: #D32F2F;");
    } else {
        // console.log(`%cCreating ${numHearts} NORMAL HEARTS (♥) for trigger ${container.dataset.associatedTriggerId}`, "color: #2196F3;");
    }

    for (let i = 0; i < numHearts; i++) {
        const heart = document.createElement('div');
        heart.className = 'heart';
        heart.textContent = heartCharacter;
        if (heartColor) { heart.style.color = heartColor; }
        const startX = Math.random() * baseElementRect.width;
        const startY = Math.random() * baseElementRect.height;
        heart.style.left = `${startX}px`;
        heart.style.top = `${startY}px`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 20;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance - 30;
        heart.style.setProperty('--tx', `${tx}px`);
        heart.style.setProperty('--ty', `${ty}px`);
        container.appendChild(heart);
        heart.addEventListener('animationend', () => heart.remove());
    }
}

function attemptRemoveHeartContainer(triggerId) {
    if (currentHeartContainer && currentHeartContainer.dataset.associatedTriggerId === triggerId) {
        delete currentHeartContainer.dataset.keepAlive;
        clearTimeout(heartSplashTimeout);
        heartSplashTimeout = setTimeout(() => {
            if (currentHeartContainer && currentHeartContainer.dataset.associatedTriggerId === triggerId && !currentHeartContainer.dataset.keepAlive) {
                currentHeartContainer.remove();
                currentHeartContainer = null;
            }
        }, 300);
    }
}

// --- Event Handlers ---
// REGULAR ICON HOVER
function handleIconHover(event) {
    console.log(`%cIMMEDIATE MOUSE ENTER (REGULAR) for icon: ${event.currentTarget.dataset.hkIconId} - Target:`, event.target, "Triggered at: " + new Date().toISOString());
    const iconElement = event.currentTarget;
    const container = createOrGetHeartContainer(iconElement, iconElement.dataset.hkIconId);
    createHeartsInContainer(container, iconElement.getBoundingClientRect(), { type: HEART_TYPE_NORMAL });
}
function handleIconMouseLeave(event) {
    attemptRemoveHeartContainer(event.currentTarget.dataset.hkIconId);
}

// GENERAL TOOLTIP (WITH DISABLED BUTTON INSIDE) HOVER
function handleSpecialTooltipHover(event) {
    console.log(`%cIMMEDIATE MOUSE ENTER (SPECIAL TOOLTIP) for tooltip: ${event.currentTarget.dataset.hkTooltipId} - Target:`, event.target, "Triggered at: " + new Date().toISOString());
    const tooltipDiv = event.currentTarget;
    const targetIconId = tooltipDiv.dataset.hkTargetIconId;
    const targetIconElement = document.querySelector(`[data-hk-icon-id="${targetIconId}"]`);
    if (!targetIconElement) { console.error("Target icon not found for special tooltip hover:", targetIconId); return; }
    const container = createOrGetHeartContainer(tooltipDiv, tooltipDiv.dataset.hkTooltipId);
    createHeartsInContainer(container, targetIconElement.getBoundingClientRect(), { type: HEART_TYPE_BROKEN });
}
function handleSpecialTooltipMouseLeave(event) {
    attemptRemoveHeartContainer(event.currentTarget.dataset.hkTooltipId);
}

// "CANNOT EDIT" WRAPPER DIV HOVER
function handleCannotEditWrapperHover(event) {
    console.log(`%cIMMEDIATE MOUSE ENTER (CANNOT EDIT WRAPPER) for wrapper: ${event.currentTarget.dataset.hkCannotEditWrapperId} - Target:`, event.target, "Triggered at: " + new Date().toISOString());
    const wrapperDiv = event.currentTarget;
    const targetIconId = wrapperDiv.dataset.hkTargetIconId;
    const targetIconElement = document.querySelector(`[data-hk-icon-id="${targetIconId}"]`);
    if (!targetIconElement) { console.error("Target icon not found for cannot-edit wrapper hover:", targetIconId); return; }
    const container = createOrGetHeartContainer(wrapperDiv, wrapperDiv.dataset.hkCannotEditWrapperId);
    createHeartsInContainer(container, targetIconElement.getBoundingClientRect(), { type: HEART_TYPE_BROKEN });
}
function handleCannotEditWrapperMouseLeave(event) {
    attemptRemoveHeartContainer(event.currentTarget.dataset.hkCannotEditWrapperId);
}

// NEW: "ISSUE LINE CARD" DIV HOVER
function handleIssueLineCardHover(event) {
    console.log(`%cIMMEDIATE MOUSE ENTER (ISSUE LINE CARD) for card: ${event.currentTarget.dataset.hkIssueLineCardId} - Target:`, event.target, "Triggered at: " + new Date().toISOString());
    const cardDiv = event.currentTarget;
    const targetIconId = cardDiv.dataset.hkTargetIconId;
    const targetIconElement = document.querySelector(`[data-hk-icon-id="${targetIconId}"]`);
    if (!targetIconElement) { console.error("Target icon not found for issue line card hover:", targetIconId); return; }
    // Container is positioned relative to the cardDiv, hearts emanate from icon
    const container = createOrGetHeartContainer(cardDiv, cardDiv.dataset.hkIssueLineCardId);
    createHeartsInContainer(container, targetIconElement.getBoundingClientRect(), { type: HEART_TYPE_NORMAL }); // NORMAL pink hearts
}
function handleIssueLineCardMouseLeave(event) {
    attemptRemoveHeartContainer(event.currentTarget.dataset.hkIssueLineCardId);
}

// CLICK HANDLER (COMMON FOR ALL)
function handleIconClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const iconElement = event.currentTarget;
    const targetUrl = iconElement.getAttribute(ORIGINAL_LINK_KEY);
    if (targetUrl) { window.open(targetUrl, '_blank'); }
}

// --- Main Execution ---
function processPage() {
    const iconsToReplace = findBugIcons();
    if (iconsToReplace.length > 0) {
        iconsToReplace.forEach(icon => {
            try { replaceIcon(icon); } catch (e) { console.error("Error replacing icon:", icon, e); }
        });
    }
}
processPage();
const observer = new MutationObserver((mutationsList) => {
    let needsProcessing = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const querySelectors = findBugIcons.selectors?.join(',');
                    if (querySelectors && (node.matches(querySelectors) || node.querySelector(querySelectors))) {
                        needsProcessing = true; break;
                    }
                }
            }
        }
        if (needsProcessing) break;
    }
    if (needsProcessing) { processPage(); }
});
observer.observe(document.body, { childList: true, subtree: true });
console.log("Hello Kitty Bug Replacer ready with more specific hover logic!");