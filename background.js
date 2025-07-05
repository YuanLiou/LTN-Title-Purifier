chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.title) {
    fetch('http://localhost:1234/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: '你是一個協助改寫新聞標題的助理。你的目標是將聳動的標題改寫成平鋪直敘的風格。請只回傳改寫後的標題，不要包含任何其他文字或解釋。'
          },
          {
            role: 'user',
            content: `請將這個標題改寫成平淡的風格，並使用台灣繁體中文回覆：「${request.title}」`
          }
        ],
        temperature: 0.7,
        max_tokens: -1,
        stream: false,
      }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.choices && data.choices[0] && data.choices[0].message) {
          sendResponse({ newTitle: data.choices[0].message.content });
        }
      })
      .catch(error => {
        console.error('Error calling LLM API:', error);
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          function: () => {
            alert('Error calling LLM API. Please check the console for details.');
          },
        });
      });
    return true; // Indicates that the response is sent asynchronously
  }
});