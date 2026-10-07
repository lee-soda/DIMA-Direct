// 공통 유틸리티 함수 정의

// 확장앱 내 리소스(JSON 등)를 가져오는 함수
async function fetchJson(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  return response.json();
}

// Chrome 저장소에서 데이터 가져오기 (Promise 반환)
function getChromeStorageData(keys) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, resolve);
  });
}

// Chrome 저장소에 데이터 저장하기 (Promise 반환)
function setChromeStorageData(dataObj) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(dataObj, () => resolve(true));
  });
}
