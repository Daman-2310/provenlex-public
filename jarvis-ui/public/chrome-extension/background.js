// Service worker — registers context menu, forwards selections to the content script.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'gs-screen',
    title: 'Screen "%s" with Genesis Swarm',
    contexts: ['selection'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'gs-screen' && tab?.id && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, { type: 'gs-screen', text: info.selectionText })
  }
})
