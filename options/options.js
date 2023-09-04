const itemColorList = ["white", "black"];
const itemLinkList =  ["홈페이지", "인트라넷", "DIMA C", "전자출결", "장비대여", "버스시간표", "에브리타임", "나의 학과", "사이트맵", "공지사항", "수강신청", "학사일정", "외출외박신청", "시간표 조회", "교과목 조회", "학교 이메일", "교내 전화번호", "LMS", "창의융합교양", "시설대여", "실습실대여", "채용정보", "입시 홈페이지", "도서관", "디마티비", "웹증명발급", "무인 프린트"];
const itemDepartmentList = ["방송기술과", "음향제작과", "뉴미디어콘텐츠과", "영상제작과", "방송콘텐츠제작과", "방송극작과", "광고크리에이티브과", "디지털영상디자인과", "연극과", "뮤지컬과", "영화예술과", "무대미술과", "기악과", "성악(보컬)과", "작곡과","K-POP과", "방송영화연기과", "패션스타일리스트과", "엔터테인먼트경영과", "전공심화)"];

//json 데이터에서 LinkList 파싱, 구현 예정
/*
fetch(chrome.extension.getURL('../data/page.json'))
.then((resp) => resp.json())
.then(function (jsonData) {
    console.log(Object.keys(jsonData));
});
*/

/*메인 함수, 윈도우가 로드되면 실행*/
window.addEventListener('load', function(){

    /*테마 선택 옵션 생성 기능*/

    let buttonColorElement = document.getElementById('button-color')

    //테마 선택 버튼 생성
    for (let item of itemColorList) {
        let button = document.createElement('button');
        button.textContent = item;

        //버튼 클릭시 테마 설정 동기화
        button.addEventListener('click', function() {
            chrome.storage.sync.set({Color: item}, function() {

            });
        });

        buttonColorElement.appendChild(button);
    }

    /*학과 선택 옵션 생성 기능*/

    let formElement = document.getElementById('form-department');
    let selectElement = document.getElementById('select-department');

    //학과 선택 버튼 생성
    for (let item of itemDepartmentList) {
        var select = document.createElement('option');
        select.setAttribute('value', item);
        select.textContent = item;

        selectElement.appendChild(select);
    }

    let button = document.createElement('button');

    button.id = "button-department";
    button.textContent = "변경";

    //버튼 클릭시 학과 설정 동기화
    button.addEventListener('click', function() {
        let data = selectElement.options[selectElement.selectedIndex].value;

        chrome.storage.sync.set({Department: data}, function() {
            window.alert(data + "로 변경 되었습니다!");
        });
    });

    formElement.appendChild(button);

    /*바로가기 선택 옵션 생성 기능*/

    for (let i = 1; i <= 12; i++){
        itemLinkOptions(document.getElementById(`button-link-${i}`), itemLinkList, i);
    }
});

/*바로가기 선택 옵션 생성 함수*/
function itemLinkOptions(buttonLinkElement, itemLinkList, num) {
    for (let item of itemLinkList) {
        let button = document.createElement('button');
        button.textContent = item

        //버튼 클릭시 바로가기 설정 동기화
        button.addEventListener('click', function() {
            chrome.storage.sync.set({[`Link${num}`] : item}, function() {

            });
        });

        buttonLinkElement.appendChild(button);
    }
}
