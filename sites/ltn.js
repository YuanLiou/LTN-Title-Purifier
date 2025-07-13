/**
 * @file ltn.js
 * @description
 *  這個 Script 專門處理自由時報 (news.ltn.com.tw) 網站上的標題。
 */

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

// 等待 common.js 發出 API 可用的訊號
document.addEventListener('LtnPurifyApiReady', () => {
    console.log('[LTN Purify] 偵測到自由時報，啟動 LTN 處理模組。');
    handleLtnNews();
});
