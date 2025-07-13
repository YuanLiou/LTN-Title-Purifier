/**
 * @file common.js
 * @description
 *  這個檔案包含了所有網站都會用到的共用函式和變數。
 *  - 標題處理佇列 (Message Queue)
 *  - 與 background.js 的通訊邏輯
 *  - 標題節點的處理函式 (processHeadline)
 */

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

  // 如果總部回覆「API可以用！」，我們就派發一個事件通知網站專屬腳本。
  if (response && response.isAvailable) {
    console.log('[LTN Purify] API 可用，準備開始改寫標題。');
    document.dispatchEvent(new CustomEvent('LtnPurifyApiReady'));
  } else {
    // 如果總部回覆「API現在不行」，我們就在 console 留個紀錄，然後收工。
    console.log('[LTN Purify] API 目前不可用，Script 停止執行。');
  }
});
