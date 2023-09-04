chrome.runtime.onInstalled.addListener(function() {
    chrome.storage.sync.set({Color : "white", Department : "나의 학과", Link1: "홈페이지", Link2: "인트라넷", Link3: "DIMA C", Link4: "전자출결", Link5: "LMS", Link6: "버스시간표", Link7: "공지사항", Link8: "에브리타임", Link9: "장비대여", Link10: "시간표 조회", Link11: "무인 프린트", Link12: "나의 학과"}, function() {
        console.log();
    });
});
