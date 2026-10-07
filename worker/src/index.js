const ROUTE_PATH = '/v1/bus-arrivals';
const STATION_ID = '231001421';
const GBIS_ENDPOINT = 'https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2';
const UPSTREAM_TIMEOUT_MS = 5000;
const CACHE_CONTROL = 'public, max-age=20, stale-if-error=120';

const PUBLIC_HEADERS = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Age, CF-Cache-Status, X-DIMA-Cache-Version',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-DIMA-Cache-Version': '1',
  'X-Frame-Options': 'DENY'
});

class UpstreamError extends Error {
  constructor(type, details = {}) {
    super(type);
    this.name = 'UpstreamError';
    this.type = type;
    this.details = details;
  }
}

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

export async function handleRequest(request, env, dependencies = {}) {
  const url = new URL(request.url);

  if (url.pathname !== ROUTE_PATH) {
    return errorResponse(404, 'not_found');
  }

  if (request.method !== 'GET') {
    return errorResponse(405, 'method_not_allowed', { Allow: 'GET' });
  }

  if (url.search !== '') {
    return errorResponse(400, 'query_not_allowed');
  }

  if (!env?.GBIS_SERVICE_KEY) {
    writeLog(dependencies.logger, 'error', {
      event: 'gbis_fetch',
      outcome: 'error',
      errorType: 'missing_secret',
      durationMs: 0
    });
    return unavailableResponse();
  }

  return fetchBusArrivals(env.GBIS_SERVICE_KEY, dependencies);
}

async function fetchBusArrivals(serviceKey, dependencies) {
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now || (() => new Date());
  const timeoutMs = dependencies.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstreamUrl = new URL(GBIS_ENDPOINT);
    upstreamUrl.searchParams.set('format', 'json');
    upstreamUrl.searchParams.set('serviceKey', serviceKey);
    upstreamUrl.searchParams.set('stationId', STATION_ID);

    const response = await fetchImpl(upstreamUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new UpstreamError('http_status', { upstreamStatus: response.status });
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new UpstreamError('invalid_json');
    }

    const header = payload?.response?.msgHeader;
    const resultCode = String(header?.resultCode ?? '');
    if (resultCode !== '0' && resultCode !== '4') {
      throw new UpstreamError('result_code', { resultCode });
    }

    const arrivals = resultCode === '4'
      ? []
      : normalizeArrivals(payload?.response?.msgBody?.busArrivalList);
    const status = arrivals.length > 0 ? 'live' : 'no-service';

    writeLog(dependencies.logger, 'log', {
      event: 'gbis_fetch',
      outcome: status,
      resultCode,
      durationMs: Date.now() - startedAt
    });

    return jsonResponse({
      status,
      updatedAt: now().toISOString(),
      stationId: STATION_ID,
      arrivals
    }, 200, { cacheable: true });
  } catch (error) {
    const classified = classifyError(error, controller.signal);
    writeLog(dependencies.logger, 'error', {
      event: 'gbis_fetch',
      outcome: 'error',
      errorType: classified.type,
      ...(classified.resultCode ? { resultCode: classified.resultCode } : {}),
      ...(classified.upstreamStatus ? { upstreamStatus: classified.upstreamStatus } : {}),
      durationMs: Date.now() - startedAt
    });
    return unavailableResponse();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeArrivals(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map(item => ({
      routeName: safeText(item?.routeName, 24),
      routeDestName: safeText(item?.routeDestName, 80),
      flag: safeText(item?.flag, 16).toUpperCase(),
      predictTime1: safeNonNegativeInteger(item?.predictTime1),
      predictTime2: safeNonNegativeInteger(item?.predictTime2),
      predictTimeSec1: safeNonNegativeInteger(item?.predictTimeSec1),
      predictTimeSec2: safeNonNegativeInteger(item?.predictTimeSec2),
      locationNo1: safeNonNegativeInteger(item?.locationNo1),
      locationNo2: safeNonNegativeInteger(item?.locationNo2)
    }))
    .filter(item => item.routeName !== '');
}

function safeText(value, maxLength) {
  return String(value ?? '').normalize('NFKC').trim().slice(0, maxLength);
}

function safeNonNegativeInteger(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

function classifyError(error, signal) {
  if (signal.aborted || error?.name === 'AbortError') return { type: 'timeout' };
  if (error instanceof UpstreamError) return { type: error.type, ...error.details };
  return { type: 'network' };
}

function unavailableResponse() {
  return jsonResponse({ status: 'unavailable', arrivals: [] }, 503, { cacheable: false });
}

function errorResponse(status, code, extraHeaders = {}) {
  return jsonResponse({ status: 'error', error: code }, status, {
    cacheable: false,
    extraHeaders
  });
}

function jsonResponse(payload, status, options) {
  const headers = new Headers(PUBLIC_HEADERS);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', options.cacheable ? CACHE_CONTROL : 'no-store');
  for (const [name, value] of Object.entries(options.extraHeaders || {})) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function writeLog(logger, level, payload) {
  const target = logger || console;
  const method = typeof target[level] === 'function' ? level : 'log';
  target[method](JSON.stringify(payload));
}
