/**
 * @file background.js
 * @description
 *  這是 Chrome 擴充套件的背景 Script
 *  它在背景持續運行，主要負責兩件大事：
 *  1. 與後端語言模型（LLM）API 溝通，發送請求並接收改寫後的標題。
 *  2. 管理整個擴充套件的狀態，例如「API 目前是否可用」。
 *  它也像一個總機，負責接收來自其他部分（如 content.js 和 popup.js）的訊息，並做出回應。
 */

// =============================================
// 常數設定 (Configuration)
// =============================================

// API 狀態檢查的超時時間 (單位：毫秒)。沒回應就算失敗。
const API_STATUS_TIMEOUT = 5000;
// API 標題改寫請求的超時時間 (單位：毫秒)。沒回應就算失敗，因為 LLM 可能需要多一點時間思考。
const API_REWRITE_TIMEOUT = 15000;
// 後端 API 的網址。
const API_ENDPOINT = 'http://localhost:1234/v1/chat/completions';
// 我們給予 LLM 的「系統指令」，告訴它要扮演什麼角色，以及該如何行動。
const SYSTEM_PROMPT = '你是一個協助改寫新聞標題的助理。你的目標是將聳動的標題改寫成平鋪直敘的風格。請只回傳改寫後的標題，不要包含任何其他文字或解釋。';

// =============================================
// 核心功能 (Core Functions)
// =============================================

/**
 * 一個帶有超時功能的 fetch 請求。
 * 如果在指定時間內沒有回來（timeout），我們就直接不等了，當作任務失敗（abort）。
 * @param {string} url - 要請求的網址。
 * @param {object} options - fetch 的設定，跟原本的 fetch 一樣。
 * @param {number} timeout - 超時時間（毫秒）。
 * @returns {Promise<Response>} - 一個 fetch 的 Promise 物件。
 */
function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  options.signal = controller.signal;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // .finally() 確保不論請求成功或失敗，最後都會把鬧鐘關掉（clearTimeout）。
  return fetch(url, options).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * 檢查後端 API 是否活著。
 * 它會發送一個非常小的「ping」請求，如果成功收到回應，就代表 API 沒問題。
 * @param {function(boolean): void} [callback] - 一個回呼函式。檢查完成後，會呼叫它並傳入結果（true 或 false）。
 */
function checkApiStatus(callback) {
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
  };

  fetchWithTimeout(API_ENDPOINT, options, API_STATUS_TIMEOUT)
    .then(response => {
      // response.ok 代表 HTTP 狀態碼是 200-299，表示請求成功。
      const isAvailable = response.ok;
      chrome.storage.local.set({ apiAvailable: isAvailable });
      if (callback) callback(isAvailable);
    })
    .catch(error => {
      // 如果請求失敗（例如網路不通、超時），就會進到這裡。
      if (error.name === 'AbortError') {
        console.error('API 狀態檢查超時（超過5秒）。');
      }
      chrome.storage.local.set({ apiAvailable: false });
      if (callback) callback(false);
    });
}

// =============================================
// 事件監聽 (Event Listeners)
// =============================================

// 當擴充套件被安裝或更新時，檢查一次 API 狀態。
chrome.runtime.onInstalled.addListener(() => checkApiStatus());
// 當瀏覽器啟動時，也檢查一次 API 狀態。
chrome.runtime.onStartup.addListener(() => checkApiStatus());

/**
 * 這是整個背景 Script 最重要的部分：訊息總機。
 * 它會監聽來自擴充套件其他地方（content.js, popup.js）的訊息。
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 判斷收到的訊息類型，並分派給對應的處理邏輯。

  // 如果是 content.js 或 popup.js 在詢問「API 現在能用嗎？」
  if (request.action === 'getApiStatus') {
    // 馬上做一次即時檢查，並透過 sendResponse 把結果回傳。
    checkApiStatus(isAvailable => {
      sendResponse({ isAvailable });
    });
    // return true 告訴 Chrome，我們會「非同步」地回傳結果（因為要等 checkApiStatus 完成）。
    // 如果不加這行，訊息通道會立刻關閉，導致 sendResponse 失敗。
    return true;
  }

  // 如果是 content.js 送來一個新聞標題，要求改寫。
  if (request.title) {
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `請將這個標題改寫成平淡的風格，並使用台灣繁體中文回覆：「${request.title}」` }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: false,
      }),
    };

    fetchWithTimeout(API_ENDPOINT, options, API_REWRITE_TIMEOUT)
      .then(response => {
        if (!response.ok) {
          // 如果 API 回傳了錯誤（例如 500 Server Error），我們就主動拋出一個錯誤，讓 .catch 去接。
          throw new Error(`API 請求失敗，狀態碼: ${response.status}`);
        }
        return response.json(); // 解析回傳的 JSON 資料。
      })
      .then(data => {
        // 檢查回傳的資料格式是否符合預期。
        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          // 成功！把改寫好的標題回傳給 content.js。
          sendResponse({ newTitle: data.choices[0].message.content });
        } else {
          // API 回應了，但格式不對，這也是一種錯誤。
          sendResponse({ error: "從 API 收到的資料格式不正確。" });
        }
      })
      .catch(error => {
        // 統一處理所有請求過程中發生的錯誤（網路、超時、伺服器錯誤等）。
        if (error.name === 'AbortError') {
          console.error('API 標題改寫請求超時（超過15秒）。');
          sendResponse({ error: "請求超時，後端 API 可能正忙碌中。" });
        } else {
          console.error('呼叫 LLM API 時發生錯誤:', error);
          sendResponse({ error: "無法連線至後端 API。" });
        }
        // 只要發生任何錯誤，就立刻把 API 狀態設為「不可用」。
        chrome.storage.local.set({ apiAvailable: false });
      });

    // 同樣，return true 來保持訊息通道開啟，直到我們非同步地送回結果。
    return true;
  }
});