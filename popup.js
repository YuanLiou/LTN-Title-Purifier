
/**
 * @file popup.js
 * @description
 *  這個 Script 控制著當你點擊瀏覽器右上角的擴充套件圖示時，所出現的那個小視窗（popup）的行為。
 *  它的功能非常單純，就像一個儀表板，只做一件事：
 *  顯示後端 API 目前的連線狀態是「已連接」還是「無法使用」。
 */

// `DOMContentLoaded` 是一個事件，它在小視窗的 HTML 內容完全載入和解析完畢後觸發。
// 我們把所有程式碼放在這裡面，確保在我們試圖操作頁面元素（例如 <p id="status">）時，它們確實已經存在了。
document.addEventListener('DOMContentLoaded', () => {

  // 透過 ID 找到 HTML 中那個用來顯示狀態的段落元素。
  const statusElement = document.getElementById('status');

  // 一開始，先顯示一個「正在檢查...」的訊息，讓使用者知道程式正在運作。
  statusElement.textContent = '正在檢查後端 API 狀態...';

  // 向背景 Script （background.js）發送一個訊息，詢問「API 現在的狀態是什麼？」
  chrome.runtime.sendMessage({ action: 'getApiStatus' }, (response) => {
    // 這是在收到 background.js 回應後要執行的程式碼。

    if (chrome.runtime.lastError) {
      // 如果在發送訊息的過程中發生錯誤（例如 background.js 剛好在忙或出錯了），
      // 就在儀表板上顯示錯誤訊息。
      statusElement.textContent = '無法獲取後端 API 狀態';
      console.error("Popup 錯誤:", chrome.runtime.lastError.message);
      return;
    }

    // 根據 background.js 回傳的 response.isAvailable 是 true 還是 false，
    // 來更新儀表板上的文字，告訴使用者最終的結果。
    if (response && response.isAvailable) {
      statusElement.textContent = '後端 API 已連接';
    } else {
      statusElement.textContent = '後端 API 目前無法使用';
    }
  });
});
