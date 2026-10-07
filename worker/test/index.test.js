import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRequest } from '../src/index.js';

const ENDPOINT = 'https://example.workers.dev/v1/bus-arrivals';
const FIXED_DATE = new Date('2026-10-06T10:00:00.000Z');

function makeLogger() {
  const entries = [];
  return {
    entries,
    log(value) { entries.push(JSON.parse(value)); },
    error(value) { entries.push(JSON.parse(value)); }
  };
}

function gbisResponse(resultCode, busArrivalList) {
  return new Response(JSON.stringify({
    response: {
      msgHeader: { resultCode, resultMessage: 'ignored by proxy logs' },
      msgBody: { busArrivalList }
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('정상 응답은 허용 필드만 반환하고 20초 캐시를 설정한다', async () => {
  const logger = makeLogger();
  const fetchImpl = async url => {
    assert.equal(url.searchParams.get('stationId'), '231001421');
    assert.equal(url.searchParams.get('serviceKey'), 'test-secret');
    return gbisResponse('0', [{
      routeName: '8830-1',
      routeDestName: '인천터미널',
      flag: 'RUN',
      predictTime1: '12',
      predictTime2: '',
      predictTimeSec1: '710',
      predictTimeSec2: null,
      locationNo1: '3',
      locationNo2: '',
      secretUnexpectedField: 'must-not-leak'
    }]);
  };

  const response = await handleRequest(new Request(ENDPOINT), { GBIS_SERVICE_KEY: 'test-secret' }, {
    fetchImpl,
    now: () => FIXED_DATE,
    logger
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=20, stale-if-error=120');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(payload, {
    status: 'live',
    updatedAt: '2026-10-06T10:00:00.000Z',
    stationId: '231001421',
    arrivals: [{
      routeName: '8830-1',
      routeDestName: '인천터미널',
      flag: 'RUN',
      predictTime1: 12,
      predictTime2: null,
      predictTimeSec1: 710,
      predictTimeSec2: null,
      locationNo1: 3,
      locationNo2: null
    }]
  });
  assert.equal(logger.entries[0].outcome, 'live');
  assert.equal(JSON.stringify(logger.entries).includes('test-secret'), false);
});

test('GBIS 결과 코드 4는 no-service 정상 응답으로 처리한다', async () => {
  const response = await handleRequest(new Request(ENDPOINT), { GBIS_SERVICE_KEY: 'test-secret' }, {
    fetchImpl: async () => gbisResponse('4', null),
    now: () => FIXED_DATE,
    logger: makeLogger()
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'no-service',
    updatedAt: '2026-10-06T10:00:00.000Z',
    stationId: '231001421',
    arrivals: []
  });
});

test('원본 5xx와 네트워크 오류는 503 고정 응답으로 변환한다', async () => {
  for (const fetchImpl of [
    async () => new Response('failure', { status: 502 }),
    async () => { throw new TypeError('network down'); }
  ]) {
    const response = await handleRequest(new Request(ENDPOINT), { GBIS_SERVICE_KEY: 'test-secret' }, {
      fetchImpl,
      logger: makeLogger()
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { status: 'unavailable', arrivals: [] });
  }
});

test('원본 응답 제한시간을 넘기면 503으로 전환한다', async () => {
  const logger = makeLogger();
  const response = await handleRequest(new Request(ENDPOINT), { GBIS_SERVICE_KEY: 'test-secret' }, {
    timeoutMs: 5,
    logger,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      }, { once: true });
    })
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable', arrivals: [] });
  assert.equal(logger.entries[0].errorType, 'timeout');
});

test('잘못된 경로, 쿼리, 메서드는 원본 API를 호출하지 않는다', async () => {
  let calls = 0;
  const dependencies = {
    fetchImpl: async () => { calls += 1; return gbisResponse('0', []); },
    logger: makeLogger()
  };
  const cases = [
    [new Request('https://example.workers.dev/other'), 404],
    [new Request(`${ENDPOINT}?stationId=1`), 400],
    [new Request(ENDPOINT, { method: 'POST' }), 405],
    [new Request(ENDPOINT, { method: 'OPTIONS' }), 405]
  ];

  for (const [request, expectedStatus] of cases) {
    const response = await handleRequest(request, { GBIS_SERVICE_KEY: 'test-secret' }, dependencies);
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(calls, 0);
});

test('비밀값이 없으면 원본 API를 호출하지 않고 503을 반환한다', async () => {
  let called = false;
  const response = await handleRequest(new Request(ENDPOINT), {}, {
    fetchImpl: async () => { called = true; return gbisResponse('0', []); },
    logger: makeLogger()
  });

  assert.equal(called, false);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable', arrivals: [] });
});
