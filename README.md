# DIMA Direct 3.0

동아방송예술대학교 학생이 자주 사용하는 학사 서비스와 캠퍼스 교통 정보를 빠르게 확인하는 Chromium 확장 프로그램입니다.

## 주요 기능

- 헤이영, 인트라넷, LMS, 장비·시설 대여 등 학교 서비스 바로가기
- 바로가기 4열 표시와 이미지형·간략형 전환
- 바로가기 최소 4개 유지, 추가·삭제·드래그 순서 변경
- 29개 학과 검색과 `나의 학과` 바로가기 연결
- 메인 화면 섹터 순서 변경 및 표시·숨기기
- 교내 셔틀 A·B·C 노선의 한국시간 기준 다음 출발 안내
- DIMA 정류장 시외버스 실시간 도착정보와 오프라인 정적 시간표
- 라이트·다크 테마와 티머니 둥근바람 Regular 글꼴

무인 프린트와 전자출결 기능은 포함하지 않습니다. 학사일정 섹터는 기본적으로 숨김 처리되어 있으며 설정에서 표시 여부를 선택할 수 있습니다.

## 3.0 화면

![DIMA Direct 3.0 메인 화면](store-assets/3.0.0/Dima-Direct%20SHOW%2001.png)

![DIMA Direct 3.0 설정 화면](store-assets/3.0.0/Dima-Direct%20SHOW%2003.png)

Chrome 웹 스토어용 전체 이미지와 프로모션 타일은 [`store-assets/3.0.0`](store-assets/3.0.0)에 있습니다.

## 로컬 설치

1. Chrome 또는 Edge의 확장 프로그램 관리 화면을 엽니다.
2. 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램을 로드`를 선택합니다.
4. 이 폴더를 지정합니다.

## 권한과 개인정보

- `storage`: 테마, 학과, 바로가기와 메인 화면 설정 저장
- `https://dima-direct-bus-proxy.dhflyfree03.workers.dev/*`: 공개 버스 도착정보 조회

GBIS 서비스 키는 확장 프로그램에 포함하지 않고 Cloudflare Worker Secret으로만 보관합니다. 사용자 계정, 학번, 비밀번호와 위치정보는 수집하거나 서버로 전송하지 않습니다.

## 버스 API 경유 서버

Worker 소스와 테스트는 `worker/`에 있습니다.

```powershell
Set-Location .\worker
npm ci
npm test
npm run deploy:check
```

실제 배포 전 Cloudflare Secret `GBIS_SERVICE_KEY`가 등록되어 있어야 합니다. Worker 오류나 오프라인 상태에서는 확장 프로그램이 저장된 정적 시간표로 전환됩니다.

## 배포 패키지

확장 프로그램 패키지에는 다음 항목만 포함합니다.

- `manifest.json`
- `assets/`
- `css/`
- `data/`
- `js/`
- `pages/`

`worker/`, `worker/.wrangler/`, `worker/node_modules/`는 확장 프로그램 ZIP에 포함하지 않습니다.

## 출처

- [동아방송예술대학교](https://www.dima.ac.kr/)
- [학교 버스 시간표](https://www.dima.ac.kr/?p=97)
- [경기도 버스정보시스템](https://www.gbis.go.kr/)

초기 버전은 [GENYF/Ajou-Swift](https://github.com/GENYF/Ajou-Swift)를 기반으로 제작되었습니다. 학교 명칭과 로고의 권리는 동아방송예술대학교에 있습니다.
