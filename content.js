/**
 * @file content.js
 * @description
 *  這個 Script 是擴充套件的「前線作戰部隊」，它會被直接注入到我們指定的網頁中運作。
 *  它的任務很單純：
 *  1. 找出頁面上的所有新聞標題。
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

// =============================================
// 全站共用函式與變數 (Shared Functions & Variables)
// =============================================

// 檢查標題是否為空或只包含空白字元（包括換行符號）
const isEmptyOrWhitespace = (str) => {
  return !str || !str.trim() || /^\s*$/.test(str);
};

const MESSAGE_INTERVAL = 25; // 每 25ms 最多送一次

// 標題處理優先權設定（數字越大越優先）
const PRIORITY = {
  // LTN
  MAIN_LIST: 5,   // 一般新聞列表的標題
  HOT_NEWS: 4,    // 熱門新聞
  MARKET_NEWS: 3, // 熱門新訊
  CAROUSEL: 2,    // 大圖輪播區
  MARQUEE: 1,     // 快訊
  // LINE Today
  LINE_HEADLINE: 5 // LINE Today 的標題
};
const messageQueue = [];
let queueWorkerRunning = false;

const sendTitleForRewrite = (title, priority = 0) => {
  return new Promise((resolve, reject) => {
    messageQueue.push({ title, priority, resolve, reject });
    runQueueWorker();
  });
};

const runQueueWorker = async () => {
  if (queueWorkerRunning) return;
  queueWorkerRunning = true;
  while (messageQueue.length) {
    // 每次處理前依權重重新排序，確保高優先權先送出
    messageQueue.sort((a, b) => b.priority - a.priority);
    const { title, resolve, reject } = messageQueue.shift();
    try {
      const resp = await chrome.runtime.sendMessage({ title });
      resolve(resp);
    } catch (err) {
      reject(err);
    }
    // 固定間隔後再處理下一筆，避免短時間大量 Request。
    await new Promise(r => setTimeout(r, MESSAGE_INTERVAL));
  }
  queueWorkerRunning = false;
};

const processHeadline = async (headline, priority) => {
  const originalTitle = headline.textContent.trim();
  if (isEmptyOrWhitespace(originalTitle)) {
    return; // 如果標題是空的或只包含空白字元，就跳過。
  }

  // 檢查這個標題是否已經被我們處理過了，避免重複發送 Request 
  if (headline.dataset.ltnPurified && headline.dataset.originalTitle === originalTitle) {
    return;
  }
  
  // 立刻蓋上「處理中」的章，並記錄下原始標題。
  headline.dataset.ltnPurified = 'true';
  headline.dataset.originalTitle = originalTitle;

  try {
    // 把標題送給 background.js，並等待它回傳改寫後的結果。
    const response = await sendTitleForRewrite(originalTitle, priority);
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


/**
 * 擴充套件的主要工作函式。
 * 它會根據當前網域名稱，決定要執行哪個網站的處理邏輯。
 */
function main() {
  const hostname = window.location.hostname;

  if (hostname.includes('news.ltn.com.tw')) {
    console.log('[LTN Purify] 偵測到自由時報，啟動 LTN 處理模組。');
    handleLtnNews();
  } else if (hostname.includes('today.line.me')) {
    console.log('[LTN Purify] 偵測到 LINE Today，啟動 LINE Today 處理模組。');
    handleLineToday();
  } else {
    console.log(`[LTN Purify] 在不支援的網站 (${hostname}) 上執行，停止。`);
  }
}

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


// =============================================
// 自由時報 (LTN) 處理模組
// =============================================
function handleLtnNews() {
  const startObserver = (targetNode) => {
    const processAllHeadlines = () => {
      // 處理大圖輪播區的標題
      const carouselArticle = document.querySelector('article.boxTitle[data-desc="輪播區"]');
      if (carouselArticle) {
        const carouselH3s = carouselArticle.querySelectorAll('h3:not([data-ltn-purified])');
        carouselH3s.forEach(h => processHeadline(h, PRIORITY.CAROUSEL));
      }
      
      // 處理一般新聞列表的標題
      const headlines = targetNode.querySelectorAll('li[data-page] h3:not([data-ltn-purified])');
      headlines.forEach(h => processHeadline(h, PRIORITY.MAIN_LIST));
      
      // 如果上面的選擇器找不到（可能網頁改版了），就用一個比較寬鬆的選擇器再試一次。
      if (headlines.length === 0) {
        const allH3s = targetNode.querySelectorAll('h3:not([data-ltn-purified])');
        allH3s.forEach(h => processHeadline(h, PRIORITY.MAIN_LIST));
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
      anchors.forEach(a => processHeadline(a, PRIORITY.MARQUEE));
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
      processHeadline(link, PRIORITY.HOT_NEWS);
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
      processHeadline(link, PRIORITY.MARKET_NEWS);
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