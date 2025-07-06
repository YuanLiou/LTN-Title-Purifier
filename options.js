// options.js
// 提供使用者自訂 Local LLM API 的 port

document.addEventListener('DOMContentLoaded', () => {
  const portInput = document.getElementById('portInput');
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');

  // 讀取目前設定的 port，填入 input
  chrome.storage.local.get({ apiPort: 1234 }, (result) => {
    portInput.value = result.apiPort;
  });

  // 儲存按鈕
  saveBtn.addEventListener('click', () => {
    const portVal = parseInt(portInput.value, 10);
    if (Number.isNaN(portVal) || portVal < 1 || portVal > 65535) {
      statusEl.style.color = 'red';
      statusEl.textContent = '請輸入 1-65535 之間的數字';
      return;
    }

    // 儲存到 storage
    chrome.storage.local.set({ apiPort: portVal }, () => {
      statusEl.style.color = 'green';
      statusEl.textContent = '已儲存！';
      // 清除提示
      setTimeout(() => (statusEl.textContent = ''), 1500);
    });
  });
});
