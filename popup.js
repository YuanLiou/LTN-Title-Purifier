/**
 * This script runs when the extension's popup is opened.
 * Its primary purpose is to display the current status of the backend API.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Get the element where the status message will be displayed.
  const statusElement = document.getElementById('status');

  // Set a default message while we wait for the real status.
  statusElement.textContent = '正在檢查後端 API 狀態...';

  /**
   * Asks the background script for the current API status.
   * The background script performs a live check and sends back the result.
   */
  chrome.runtime.sendMessage({ action: 'getApiStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      // This can happen if the background script is not active or has an error.
      statusElement.textContent = '無法獲取後端 API 狀態';
      console.error("Popup error:", chrome.runtime.lastError.message);
      return;
    }

    // Update the text based on the response from the background script.
    if (response && response.isAvailable) {
      statusElement.textContent = '後端 API 已連接';
    } else {
      statusElement.textContent = '後端 API 目前無法使用';
    }
  });
});