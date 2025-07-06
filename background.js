
const API_STATUS_TIMEOUT = 5000; // 5 seconds for status check
const API_REWRITE_TIMEOUT = 15000; // 15 seconds for title rewrite

function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const signal = controller.signal;
  options.signal = signal;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, options).finally(() => {
    clearTimeout(timeoutId);
  });
}

function checkApiStatus(callback) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  };

  fetchWithTimeout('http://localhost:1234/v1/chat/completions', options, API_STATUS_TIMEOUT)
    .then(response => {
      if (response.ok) {
        chrome.storage.local.set({ apiAvailable: true });
        if (callback) callback(true);
      } else {
        chrome.storage.local.set({ apiAvailable: false });
        if (callback) callback(false);
      }
    })
    .catch(error => {
      if (error.name === 'AbortError') {
        console.error('API status check timed out.');
      }
      chrome.storage.local.set({ apiAvailable: false });
      if (callback) callback(false);
    });
}

// Check on startup and install
chrome.runtime.onStartup.addListener(() => checkApiStatus());
chrome.runtime.onInstalled.addListener(() => checkApiStatus());

// Initial check
checkApiStatus();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getApiStatus') {
    checkApiStatus(isAvailable => {
      sendResponse({ isAvailable });
    });
    return true; // Keep the message channel open for the asynchronous response
  }

  if (request.title) {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: '你是一個協助改寫新聞標題的助理。你的目標是將聳動的標題改寫成平鋪直敘的風格。請只回傳改寫後的標題，不要包含任何其他文字或解釋。' },
          { role: 'user', content: `請將這個標題改寫成平淡的風格，並使用台灣繁體中文回覆：「${request.title}」` }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: false,
      }),
    };

    fetchWithTimeout('http://localhost:1234/v1/chat/completions', options, API_REWRITE_TIMEOUT)
      .then(response => {
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.choices && data.choices[0] && data.choices[0].message) {
          chrome.storage.local.set({ apiAvailable: true });
          sendResponse({ newTitle: data.choices[0].message.content });
        } else {
          sendResponse({ error: "Invalid data format from API." });
        }
      })
      .catch(error => {
        if (error.name === 'AbortError') {
          console.error('API rewrite request timed out.');
          sendResponse({ error: "API request timed out." });
        } else {
          console.error('Error calling LLM API:', error);
          sendResponse({ error: "Failed to connect to API." });
        }
        chrome.storage.local.set({ apiAvailable: false });
      });
    return true; // Indicates that the response is sent asynchronously
  }
});
