/*메인 함수, DOM 로드되면 실행*/
window.addEventListener('DOMContentLoaded', function(){
    /*테마 변경 기능*/

    //크롬 스토리지에 동기화된 사용자 데이터 가져오기
    chrome.storage.sync.get('Color', function(data) {

        //다크모드 설정
        if(data.Color == "black"){
            let main = document.getElementById('main');

            main.style.backgroundColor = "#35363A";
            main.style.filter = "invert(0%) contrast(100%) saturate(100%) brightness(100%)";
        }
    });

    /*바로가기 생성 및 변경 기능*/

    //바로가기 12개 생성 및 변경
    for (let i = 1; i <= 12; i++) {
        setLink(document.getElementById(`item-link-${i}`), i);
    }

    /*날짜 및 학사일정 출력 기능*/

    //날짜 가져오기
    let today = new Date();
    let year = today.getFullYear();
    let month = today.getMonth() + 1;
    let date = today.getDate();

    if (month < 10){
        month = "0" + month;
    }

    if (date < 10){
        date = "0" + date;
    }

    //날짜 출력
    let dayText = year + "-" + month + "-" + date;
    document.getElementById('day').textContent = dayText;

    //학사일정 출력
    let schedule = document.getElementById('schedule');

    //json에서 DIAM Direct로 학사일정 불러오기
    fetch(chrome.runtime.getURL("../data/schedule.json"))
      .then((response) => response.json())
      .then(function (jsonData) {
          let scheduleText = "";
          Object.entries(jsonData).forEach(([key, value]) => {
              let dateRange = key.split(" ~ ");
              let startDateString = dateRange[0];
              let endDateString = dateRange.length > 1 ? dateRange[1] : startDateString;
              let eventTitle = value;

              if (dayText >= startDateString && dayText <= endDateString) {
                  scheduleText += eventTitle + "\n";
              }
          });

          if(scheduleText === ""){
              schedule.textContent = "오늘의 학사일정이 없습니다.";
          }
          else{
              schedule.textContent = scheduleText;
          }
      });

      //학사일정 페이지 바로가기 추가
      let itemSchedule = document.getElementById('item-schedule');

      clickOpenNewTeb(itemSchedule, "https://dima.ac.kr/?p=78");


    /*마우스 우클릭 및 드래그 방지 기능*/

    let main = document.getElementById('main');

    //드래그 방지
    main.addEventListener('dragstart', function(event){
        event.preventDefault();
    });



});

/*바로가기 생성 및 변경 데이터 파싱 함수*/
function setLink(itemLinkElement, num) {
    //크롬 스토리지에 동기화된 사용자 바로가기 데이터 가져오기
    chrome.storage.sync.get(`Link${num}`, function(data) {
        //json에서 Ajax로 페이지 이미지와 링크 불러오기
        let linkName = data[`Link${num}`];

        fetch(chrome.runtime.getURL("../data/page.json"))
        .then((response) => response.json())
        .then(function (jsonData) {
            let IMG = jsonData[`${linkName}`].IMG;

            if (linkName == "나의 학과") {
                chrome.storage.sync.get(`Department`, function(data) {
                    let departmentName = data.Department;

                    fetch(chrome.runtime.getURL("../data/department.json"))
                    .then((response) => response.json())
                    .then(function (jsonData) {
                        let URL = jsonData[`${departmentName}`].URL;

                        setLinkElement(itemLinkElement, linkName, URL, IMG);
                    });
                });
            }
            else {
                let URL = jsonData[`${linkName}`].URL;

                setLinkElement(itemLinkElement, linkName, URL, IMG)
            }
        });
    });
}

/*바로가기 생성 및 변경 DOM 제어 함수*/
function setLinkElement(itemLinkElement, linkName, URL, IMG){
    //페이지 클릭 이벤트 추가
    clickOpenNewTeb(itemLinkElement, URL);

    //이미지 및 텍스트 생성
    let linkImage = document.createElement('img');
    let linkText = document.createElement('p');

    linkImage.setAttribute('src', IMG);
    linkText.textContent = linkName;

    itemLinkElement.appendChild(linkImage);
    itemLinkElement.appendChild(linkText);
}

/*클릭 이벤트 및 바로가기 연결 함수*/
function clickOpenNewTeb(element, URL){
    element.addEventListener('click', function(){
        window.open(URL);
    });
}

/*검색 함수*/
