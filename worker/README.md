# DIMA Direct 버스 API Worker

동아방송예술대학교 시외버스 정류장(`231001421`)의 GBIS 도착정보만 제공하는 Cloudflare Worker입니다.

현재 배포 주소: `https://dima-direct-bus-proxy.dhflyfree03.workers.dev/v1/bus-arrivals`

## 보안 원칙

- GBIS 서비스 키는 코드나 Wrangler 설정에 넣지 않고 `GBIS_SERVICE_KEY` Secret으로만 저장합니다.
- 노출된 기존 키를 재사용하지 말고 공공데이터포털에서 재발급한 키를 사용합니다.
- 클라이언트는 정류장 ID, 원본 API 주소, 서비스 키를 전달할 수 없습니다.
- `/v1/bus-arrivals`의 쿼리 없는 `GET` 요청만 원본 API를 호출합니다.
- 로그에는 처리시간, GBIS 결과 코드, 오류 종류만 기록합니다.

## 배포

```powershell
npm install
npx wrangler login
npx wrangler secret put GBIS_SERVICE_KEY
npm run deploy
```

배포 결과 URL 뒤에 `/v1/bus-arrivals`를 붙여 확장 프로그램에 등록합니다.

```powershell
npm run configure-extension -- https://dima-direct-bus-proxy.<내-subdomain>.workers.dev/v1/bus-arrivals
```

설정 스크립트는 `data/bus.json`에 Worker 주소를 저장하고 `manifest.json`의 `host_permissions`를 해당 Worker 출처 하나로 제한합니다.

## 확인

```powershell
npm run check
npm run deploy:check
```

실제 배포 후 연속 요청의 `CF-Cache-Status`가 `MISS`에서 `HIT`로 바뀌는지 확인합니다. 정상 응답은 `Cache-Control: public, max-age=20, stale-if-error=120`으로 캐시되며, 원본 장애 시 Cloudflare Workers Cache가 최대 120초 동안 마지막 정상 응답을 제공합니다.
