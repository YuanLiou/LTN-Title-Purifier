const processHeadline = async (headline) => {
  // Mark the headline as processed to avoid reprocessing
  if (headline.dataset.processed) {
    return;
  }
  headline.dataset.processed = 'true';

  const originalTitle = headline.textContent.trim();
  if (!originalTitle) {
    return;
  }

  console.log(`[LTN Purify] Processing: ${originalTitle}`);

  try {
    const response = await chrome.runtime.sendMessage({ title: originalTitle });
    if (response && response.newTitle) {
      headline.textContent = response.newTitle;
      console.log(`[LTN Purify] Rewritten to: ${response.newTitle}`);
    }
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
        console.log('[LTN Purify] Extension context invalidated. No action taken.');
    } else {
        console.error('[LTN Purify] Error communicating with background script:', error);
    }
  }
};

const startObserver = (targetNode) => {
  const processAllHeadlines = () => {
    targetNode.querySelectorAll('h3:not([data-processed])').forEach(processHeadline);
  };

  // Process initial headlines
  processAllHeadlines();

  const observer = new MutationObserver((mutations) => {
    // Re-run the query on any change. This is robust.
    processAllHeadlines();
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
  });

  console.log('[LTN Purify] Observer started on:', targetNode);
};

// The `ul.list` element that contains the news items
const listSelector = 'ul.list';

// Wait for the target list to appear in the DOM
const interval = setInterval(() => {
  const listNode = document.querySelector(listSelector);
  if (listNode) {
    clearInterval(interval);
    startObserver(listNode);
  }
}, 500);
