const processHeadline = async (headline) => {
  const originalTitle = headline.textContent.trim();
  if (!originalTitle) {
    return;
  }

  // Check if we've already processed this headline (our own processing)
  // But only skip if the content has actually been rewritten
  if (headline.dataset.ltnPurified && headline.dataset.originalTitle === originalTitle) {
    return;
  }
  
  // Mark the headline as processed by our extension
  headline.dataset.ltnPurified = 'true';
  headline.dataset.originalTitle = originalTitle;

  try {
    const response = await chrome.runtime.sendMessage({ title: originalTitle });
    if (response && response.newTitle) {
      headline.textContent = response.newTitle;
    }
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
        // Extension context invalidated, no action needed
    } else {
        console.error('[LTN Purify] Error communicating with background script:', error);
    }
  }
};

const startObserver = (targetNode) => {
  const processAllHeadlines = () => {
    const headlines = targetNode.querySelectorAll('li[data-page] h3:not([data-ltn-purified])');
    headlines.forEach(processHeadline);
    
    // 如果沒有找到，嘗試更寬鬆的選擇器
    if (headlines.length === 0) {
      const allH3s = targetNode.querySelectorAll('h3:not([data-ltn-purified])');
      allH3s.forEach(processHeadline);
    }
  };

  // Process initial headlines
  processAllHeadlines();

  const observer = new MutationObserver((mutations) => {
    // 檢查是否有新增的 li[data-page] 元素
    let hasNewContent = false;
    let newHeadlines = [];
    
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // 檢查是否為新的 li[data-page] 元素
          if (node.matches('li[data-page]')) {
            hasNewContent = true;
            const h3 = node.querySelector('h3');
            if (h3) newHeadlines.push(h3);
          } else if (node.querySelector('li[data-page]')) {
            hasNewContent = true;
            const headlines = node.querySelectorAll('li[data-page] h3');
            newHeadlines.push(...headlines);
          }
        }
      });
    });
    
    if (hasNewContent) {
      // 直接處理新找到的標題
      newHeadlines.forEach(processHeadline);
    }
  });

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
  });
};

const listContainerSelector = 'div.whitecon.boxTitle[data-desc="新聞列表"]';

const interval = setInterval(() => {
  const listContainerNode = document.querySelector(listContainerSelector);
  if (listContainerNode) {
    clearInterval(interval);
    startObserver(listContainerNode);
  }
}, 500);
