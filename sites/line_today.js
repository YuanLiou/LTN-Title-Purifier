/**
 * @file line_today.js
 * @description
 *  這個 Script 專門處理 LINE Today (today.line.me) 網站上的標題。
 */

// =============================================
// LINE Today 處理模組
// =============================================
function handleLineToday() {
  // 這些是根據猜測的 LINE Today 頁面結構所寫的選擇器，可能需要調整。
  const headlineSelectors = [
    'a h2.article-title',
    'a .article-title',
    '.topic-title a',
    '.headline-title',
    'a[data-testid="article-item-title"]', // 根據常見的 data-* attribute 格式猜測
    '.articleBigCard-info h3.header', // 主頁卡片標題 (h3)
  ];

  const processAllLineHeadlines = (targetNode) => {
    headlineSelectors.forEach(selector => {
      // 我們只處理還沒被標記過的標題
      const headlines = targetNode.querySelectorAll(`${selector}:not([data-ltn-purified])`);
      headlines.forEach(h => processHeadline(h, PRIORITY.LINE_HEADLINE));
    });
  };

  // 使用 MutationObserver 來監控整個頁面的變化，因為 LINE Today 可能是動態載入內容的。
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          // 只處理元素節點
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 檢查新增的節點本身或其子節點是否包含標題
            processAllLineHeadlines(node);
          }
        });
      }
    });
  });

  // 頁面一載入，就先處理一次現有的標題。
  console.log('[LTN Purify] LINE Today 模組：首次掃描頁面標題...');
  processAllLineHeadlines(document.body);

  // 開始監控頁面變化
  console.log('[LTN Purify] LINE Today 模組：啟動 MutationObserver 監控頁面變化。');
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 等待 common.js 發出 API 可用的訊號
document.addEventListener('LtnPurifyApiReady', () => {
    console.log('[LTN Purify] 偵測到 LINE Today，啟動 LINE Today 處理模組。');
    handleLineToday();
});
