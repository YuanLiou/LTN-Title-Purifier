
/**
 * @file content.js
 * @description
 *  這個 Script 是擴充套件的「前線作戰部隊」，它會被直接注入到我們指定的網頁中運作。
 *  它的任務很單純：
 *  1. 找出頁面上的所有新聞標題（包含熱門新聞區塊）。
 *  2. 把標題一個一個地送給背景 Script （background.js）去改寫。
 *  3. 收到改寫後的新標題後，更新頁面上的文字。
 *  為了應對現代網頁「無限滾動」的特性，它還會像個哨兵一樣，持續監控頁面，只要有新標題出現就立刻處理。
 */

// =============================================
// 執行流程 (Execution Flow)
// =============================================

// Script 一開始，不是馬上動手，而是先「請示總部」。
// 它會向 background.js 發送一個訊息，詢問「API 現在能用嗎？」
console.log('[LTN Purify] 內容 Script 已載入，正在檢查 API 狀態...');
chrome.runtime.sendMessage({ action: 'getApiStatus' }, (response) => {
  if (chrome.runtime.lastError) {
    // 如果連 background.js 都連不上，就在 console 留下紀錄，然後停止一切動作。
    console.error('[LTN Purify] 無法連線到背景 Script:', chrome.runtime.lastError.message);
    return;
  }

  // 如果總部回覆「API可以用！」，我們才開始執行主要的任務(main)。
  if (response && response.isAvailable) {
    console.log('[LTN Purify] API 可用，準備開始改寫標題。');
    main();
  } else {
    // 如果總部回覆「API現在不行」，我們就在 console 留個紀錄，然後收工。
    console.log('[LTN Purify] API 目前不可用，Script 停止執行。');
  }
});

/**
 * 擴充套件的主要工作函式。
 * 它會先找到新聞列表的「容器」，然後啟動一個「哨兵」去監控它。
 */
function main() {
  // 檢查標題是否為空或只包含空白字元（包括換行符號）
  const isEmptyOrWhitespace = (str) => {
    return !str || !str.trim() || /^\s*$/.test(str);
  };

  const processHeadline = async (headline) => {
    const originalTitle = headline.textContent.trim();
    if (isEmptyOrWhitespace(originalTitle)) {
      return; // 如果標題是空的或只包含空白字元，就跳過。
    }

    // 檢查這個標題是否已經被我們處理過了，避免重複發送請求。
    // 就像在處理過的項目上蓋一個「已處理」的章。
    if (headline.dataset.ltnPurified && headline.dataset.originalTitle === originalTitle) {
      return;
    }
    
    // 立刻蓋上「處理中」的章，並記錄下原始標題。
    headline.dataset.ltnPurified = 'true';
    headline.dataset.originalTitle = originalTitle;

    try {
      // 把標題送給 background.js，並等待它回傳改寫後的結果。
      const response = await chrome.runtime.sendMessage({ title: originalTitle });
      if (response && response.newTitle) {
        // 如果成功，就更新頁面上的標題文字。
        headline.textContent = response.newTitle;
      }
    } catch (error) {
      // 如果在與 background.js 溝通時發生錯誤...
      if (error.message.includes('Extension context invalidated')) {
          // 這是一個正常情況，通常發生在擴充套件被更新或停用時，不需要特別處理。
      } else {
          console.error('[LTN Purify] 與背景 Script 溝通時發生錯誤:', error);
      }
    }
  };

  const startObserver = (targetNode) => {
    const processAllHeadlines = () => {
      // 處理大圖輪播區的標題
      const carouselArticle = document.querySelector('article.boxTitle[data-desc="輪播區"]');
      if (carouselArticle) {
        const carouselH3s = carouselArticle.querySelectorAll('h3:not([data-ltn-purified])');
        carouselH3s.forEach(processHeadline);
      }
      
      // 處理一般新聞列表的標題
      const headlines = targetNode.querySelectorAll('li[data-page] h3:not([data-ltn-purified])');
      headlines.forEach(processHeadline);
      
      // 如果上面的選擇器找不到（可能網頁改版了），就用一個比較寬鬆的選擇器再試一次。
      if (headlines.length === 0) {
        const allH3s = targetNode.querySelectorAll('h3:not([data-ltn-purified])');
        allH3s.forEach(processHeadline);
      }
    };

    // 立即處理一次頁面上的現有標題。
    processAllHeadlines();

    // --- MutationObserver --- 
    // 這就是我們的「哨兵」。它會盯著指定的區域（targetNode），
    // 一旦裡面有任何風吹草動（例如增加了新的子元素），它就會立刻知道。
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          // 我們只關心被新增的「元素節點」。
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 檢查新增的節點本身或其內部是否包含我們感興趣的新聞標題。
            if (node.matches('li[data-page]')) {
              const h3 = node.querySelector('h3');
              if (h3) processHeadline(h3);
            } else {
              const newHeadlines = node.querySelectorAll('li[data-page] h3');
              newHeadlines.forEach(processHeadline);
            }
          }
        });
      });
    });

    // 命令我們的哨兵開始站崗！
    observer.observe(targetNode, {
      childList: true, // 監控子元素的增加或刪除。
      subtree: true,   // 連同子孫元素也一併監控。
    });
  };

  // -----------------------------
  // 處理「快訊」區塊 (marquee)
  // -----------------------------
  const monitorMarquee = () => {
    // 專門處理 marquee 內的 a 標籤
    const processMarqueeAnchors = (root) => {
      const anchors = root.querySelectorAll('li a:not([data-ltn-purified])');
      anchors.forEach(processHeadline);
    };

    // marquee 是透過 AJAX 動態插入的，先用 polling 等待它出現
    const marqueeInterval = setInterval(() => {
      const marqueeNode = document.getElementById('marquee');
      if (marqueeNode) {
        clearInterval(marqueeInterval);

        // 初始處理一次
        processMarqueeAnchors(marqueeNode);
      }
    }, 500);
  };

  // 立即啟動 marquee 監控
  monitorMarquee();

  // 處理熱門新聞區塊
  const processHotNewsSection = () => {
    const hotNewsContainer = document.querySelector('.hotnews.bg.boxTitle.boxText');
    if (!hotNewsContainer) return false;

    // 處理現有的熱門新聞標題
    const hotNewsLinks = hotNewsContainer.querySelectorAll('a[data-desc^="T:"]');
    hotNewsLinks.forEach(link => {
      // 如果已經處理過，則跳過
      if (link.dataset.ltnPurified) return;
      
      const originalTitle = link.textContent.trim();
      if (isEmptyOrWhitespace(originalTitle)) return;
      
      // 標記為處理中
      link.dataset.ltnPurified = 'true';
      link.dataset.originalTitle = originalTitle;

      // 發送請求改寫標題
      chrome.runtime.sendMessage({ title: originalTitle })
        .then(response => {
          if (response && response.newTitle && link.parentNode) {
            link.textContent = response.newTitle;
          }
        })
        .catch(error => {
          if (!error.message.includes('Extension context invalidated')) {
            console.error('[LTN Purify] 處理熱門新聞標題時出錯:', error);
          }
        });
    });
    
    return true;
  };

  // 監控熱門新聞區塊
  const monitorHotNews = () => {
    // 先立即處理一次
    if (processHotNewsSection()) {
      return; // 如果找到並處理了熱門新聞區塊，就結束
    }
    
    // 如果沒找到，設置一個間隔來檢查
    const hotNewsInterval = setInterval(() => {
      if (processHotNewsSection()) {
        clearInterval(hotNewsInterval);
      }
    }, 500);
  };

  // 處理熱門新訊區塊
  const processMarketNewsSection = () => {
    const marketNewsContainer = document.querySelector('.market300.bg.boxTitle.boxText');
    if (!marketNewsContainer) return false;

    // 處理現有的熱門新訊標題
    const marketNewsLinks = marketNewsContainer.querySelectorAll('a[data-desc^="T:"]');
    marketNewsLinks.forEach(link => {
      // 如果已經處理過，則跳過
      if (link.dataset.ltnPurified) return;
      
      const originalTitle = link.textContent.trim();
      if (isEmptyOrWhitespace(originalTitle)) return;
      
      // 標記為處理中
      link.dataset.ltnPurified = 'true';
      link.dataset.originalTitle = originalTitle;

      // 發送請求改寫標題
      chrome.runtime.sendMessage({ title: originalTitle })
        .then(response => {
          if (response && response.newTitle && link.parentNode) {
            link.textContent = response.newTitle;
          }
        })
        .catch(error => {
          if (!error.message.includes('Extension context invalidated')) {
            console.error('[LTN Purify] 處理熱門新訊標題時出錯:', error);
          }
        });
    });
    
    return true;
  };

  // 監控熱門新訊區塊
  const monitorMarketNews = () => {
    // 先立即處理一次
    if (processMarketNewsSection()) {
      return; // 如果找到並處理了熱門新訊區塊，就結束
    }
    
    // 如果沒找到，設置一個間隔來檢查
    const marketNewsInterval = setInterval(() => {
      if (processMarketNewsSection()) {
        clearInterval(marketNewsInterval);
      }
    }, 500);
  };

  // 啟動熱門新聞監控
  monitorHotNews();
  // 啟動熱門新訊監控
  monitorMarketNews();

  // 因為新聞列表可能是由 JavaScript 動態載入的，所以我們不能假設它一開始就存在。
  // 這裡我們使用一個計時器，每半秒檢查一次，直到找到新聞列表的容器為止。
  const listContainerSelector = 'div.whitecon.boxTitle[data-desc="新聞列表"]';
  const interval = setInterval(() => {
    const listContainerNode = document.querySelector(listContainerSelector);
    if (listContainerNode) {
      // 找到了！關掉計時器，並開始執行主要的觀察任務。
      clearInterval(interval);
      startObserver(listContainerNode);
    }
  }, 500);
}
