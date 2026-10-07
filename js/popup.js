const MAIN_SECTION_IDS = ['shortcuts', 'schedule', 'shuttle', 'intercity'];
const DEFAULT_HIDDEN_MAIN_SECTIONS = ['schedule'];
const SHUTTLE_ROUTE_IDS = ['A', 'B', 'C'];
const MIN_SHORTCUTS = 4;
const DEFAULT_SHORTCUTS = [
  '홈페이지', '인트라넷', 'DIMA C', '헤이영', 'LMS', '버스시간표',
  '공지사항', '에브리타임', '장비대여', '시간표 조회', '도서관', '나의 학과'
];
const SHORTCUT_NAME_MIGRATIONS = {
  '학사일정': '헤이영',
  '외출외박신청': '기숙사 외출 · 외박'
};

let hiddenShuttleRoutes = new Set();
let busRefreshTimer;
let intercityRealtimeTimer;
let intercityRealtimeRequest = 0;
let intercityRealtimeState = {
  connected: false,
  reason: 'loading',
  items: [],
  updatedAt: null,
  delayed: false
};

window.addEventListener('DOMContentLoaded', async () => {
  const mainElement = document.getElementById('main');

  const { Color, ShortcutView } = await getChromeStorageData(['Color', 'ShortcutView']);
  mainElement.classList.toggle('dark-theme', Color === 'black');
  const shortcutView = ShortcutView === 'compact' ? 'compact' : 'icons';
  mainElement.dataset.shortcutView = shortcutView;

  const [pageData, departmentData, busData, scheduleData] = await Promise.all([
    fetchJson('../data/page.json'),
    fetchJson('../data/department.json'),
    fetchJson('../data/bus.json'),
    fetchJson('../data/schedule.json')
  ]);

  const layoutStorage = await getChromeStorageData([
    'MainSectionOrder', 'HiddenMainSections', 'HiddenShuttleRoutes'
  ]);
  const layout = normalizeMainLayout(layoutStorage);
  hiddenShuttleRoutes = new Set(layout.hiddenShuttleRoutes);
  applyMainLayout(layout.mainSectionOrder, layout.hiddenMainSections);

  if (
    !arraysEqual(layoutStorage.MainSectionOrder, layout.mainSectionOrder) ||
    !arraysEqual(layoutStorage.HiddenMainSections, layout.hiddenMainSections) ||
    !arraysEqual(layoutStorage.HiddenShuttleRoutes, layout.hiddenShuttleRoutes)
  ) {
    await setChromeStorageData({
      MainSectionOrder: layout.mainSectionOrder,
      HiddenMainSections: layout.hiddenMainSections,
      HiddenShuttleRoutes: layout.hiddenShuttleRoutes
    });
  }

  const legacyLinkKeys = DEFAULT_SHORTCUTS.map((_, index) => `Link${index + 1}`);
  const linkStorage = await getChromeStorageData(['Shortcuts', ...legacyLinkKeys]);
  const { Department } = await getChromeStorageData(['Department']);
  const legacyShortcuts = legacyLinkKeys.map(key => linkStorage[key]);
  const storedShortcuts = Array.isArray(linkStorage.Shortcuts)
    ? linkStorage.Shortcuts
    : legacyShortcuts;
  const shortcuts = normalizeShortcuts(storedShortcuts, pageData);

  if (!arraysEqual(linkStorage.Shortcuts, shortcuts)) {
    await setChromeStorageData({ Shortcuts: shortcuts });
  }

  const linksGrid = document.getElementById('popup-links-grid');
  const shortcutFragment = document.createDocumentFragment();
  shortcuts.forEach((linkName, index) => {
    const item = document.createElement('a');
    item.className = 'item-link';
    item.id = `item-link-${index + 1}`;
    setupLink(item, linkName);
    shortcutFragment.appendChild(item);
  });
  linksGrid.replaceChildren(shortcutFragment);

  displaySchedule(scheduleData);
  initializeTransportSections(busData);
  bindScheduleLink(scheduleData.sourceURL);

  function setupLink(element, linkName) {
    const iconPath = pageData[linkName]?.IMG || '';
    let targetURL = pageData[linkName]?.URL || '#';

    if (linkName === '나의 학과') {
      targetURL = Department && Department !== '나의 학과' && departmentData[Department]
        ? departmentData[Department].URL
        : chrome.runtime.getURL('pages/options.html');
    }

    element.innerHTML = '';
    element.href = targetURL;
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
    element.setAttribute('aria-label', `${linkName} 새 탭에서 열기`);
    const label = document.createElement('p');
    label.textContent = linkName;
    if (shortcutView === 'icons') {
      const img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', () => {
        img.src = '../assets/images/icon/img_site.png';
      }, { once: true });
      img.src = iconPath || '../assets/images/icon/img_site.png';
      element.append(img);
    }
    element.append(label);
  }
});

function normalizeShortcuts(values, availableLinks) {
  const normalized = (Array.isArray(values) ? values : [])
    .map(name => SHORTCUT_NAME_MIGRATIONS[name] || name)
    .filter(name => typeof name === 'string' && availableLinks[name]);

  for (const fallback of DEFAULT_SHORTCUTS) {
    if (normalized.length >= MIN_SHORTCUTS) break;
    if (availableLinks[fallback] && !normalized.includes(fallback)) normalized.push(fallback);
  }

  return normalized.slice();
}

function normalizeMainLayout(storage) {
  const storedOrder = Array.isArray(storage.MainSectionOrder) ? storage.MainSectionOrder : [];
  const mainSectionOrder = [
    ...new Set(storedOrder.filter(id => MAIN_SECTION_IDS.includes(id))),
    ...MAIN_SECTION_IDS.filter(id => !storedOrder.includes(id))
  ];
  const hiddenMainSections = Array.isArray(storage.HiddenMainSections)
    ? [...new Set(storage.HiddenMainSections.filter(id => MAIN_SECTION_IDS.includes(id)))]
    : [...DEFAULT_HIDDEN_MAIN_SECTIONS];
  const normalizedRoutes = Array.isArray(storage.HiddenShuttleRoutes)
    ? storage.HiddenShuttleRoutes.map(route => String(route).toUpperCase())
    : [];
  const hiddenShuttleRoutes = [
    ...new Set(normalizedRoutes.filter(route => SHUTTLE_ROUTE_IDS.includes(route)))
  ];

  return { mainSectionOrder, hiddenMainSections, hiddenShuttleRoutes };
}

function applyMainLayout(order, hiddenSections) {
  const container = document.getElementById('main-sections');
  const hiddenSet = new Set(hiddenSections);

  order.forEach(id => {
    const section = document.getElementById(`main-section-${id}`);
    if (!section) return;
    section.hidden = hiddenSet.has(id);
    container.appendChild(section);
  });
}

function displaySchedule(scheduleData, now = new Date()) {
  const timeParts = getKoreaTimeParts(now, 'Asia/Seoul');
  const matches = scheduleData.events.filter(event => (
    event.start <= timeParts.dateString && event.end >= timeParts.dateString
  ));
  document.getElementById('schedule-text').textContent = matches.length > 0
    ? matches.map(event => event.title).join('\n')
    : '오늘의 학사일정이 없습니다.';
}

function bindScheduleLink(sourceURL) {
  const scheduleSection = document.getElementById('main-section-schedule');
  const openSchedule = () => window.open(sourceURL, '_blank', 'noopener,noreferrer');
  scheduleSection.addEventListener('click', openSchedule);
  scheduleSection.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openSchedule();
  });
}

function initializeTransportSections(busData) {
  document.getElementById('intercity-disclaimer').textContent = busData.intercityDisclaimer;
  document.getElementById('shuttle-notice').textContent = busData.shuttle.notice;
  updateBusBoard(busData);

  clearInterval(busRefreshTimer);
  busRefreshTimer = setInterval(() => updateBusBoard(busData), 1000);

  clearInterval(intercityRealtimeTimer);
  refreshIntercityRealtime(busData);
  intercityRealtimeTimer = setInterval(
    () => refreshIntercityRealtime(busData),
    busData.intercityRealtime.refreshSeconds * 1000
  );

  window.addEventListener('online', () => refreshIntercityRealtime(busData));
  window.addEventListener('offline', () => {
    intercityRealtimeState = {
      connected: false,
      reason: 'offline',
      items: [],
      updatedAt: null,
      delayed: false
    };
    updateBusBoard(busData);
  });
}

function updateBusBoard(busData, now = new Date()) {
  const timeParts = getKoreaTimeParts(now, busData.timezone);
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const clockText = `(${dayLabels[timeParts.weekday]}) ${timeParts.hour}:${timeParts.minute}:${timeParts.second}`;

  document.querySelectorAll('.bus-kst-clock').forEach(clockElement => {
    clockElement.querySelector('.bus-clock-value').textContent = clockText;
    clockElement.dateTime = `${timeParts.dateString}T${timeParts.hour}:${timeParts.minute}:${timeParts.second}+09:00`;
    clockElement.setAttribute('aria-label', `현재 시각 ${clockText}`);
  });

  renderShuttleRoutes(busData, timeParts);
  renderIntercityRoutes(busData, timeParts, intercityRealtimeState);
}

async function refreshIntercityRealtime(busData) {
  const requestId = ++intercityRealtimeRequest;

  if (!navigator.onLine) {
    intercityRealtimeState = {
      connected: false,
      reason: 'offline',
      items: [],
      updatedAt: null,
      delayed: false
    };
    updateBusBoard(busData);
    return;
  }

  const endpoint = getConfiguredWorkerEndpoint(busData.intercityRealtime.endpoint);
  if (!endpoint) {
    intercityRealtimeState = {
      connected: false,
      reason: 'api-error',
      items: [],
      updatedAt: null,
      delayed: false
    };
    updateBusBoard(busData);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    busData.intercityRealtime.requestTimeoutMs
  );

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    if (!['live', 'no-service'].includes(payload?.status)) throw new Error('프록시 응답 오류');
    if (String(payload?.stationId || '') !== String(busData.intercityRealtime.stationId)) {
      throw new Error('정류장 응답 불일치');
    }

    const items = Array.isArray(payload.arrivals) ? payload.arrivals : [];
    const updatedAt = new Date(payload.updatedAt);
    if (Number.isNaN(updatedAt.getTime())) throw new Error('갱신 시각 오류');
    const delayed = Date.now() - updatedAt.getTime() > busData.intercityRealtime.delayedAfterSeconds * 1000;
    if (requestId !== intercityRealtimeRequest) return;

    intercityRealtimeState = {
      connected: true,
      reason: payload.status,
      items,
      updatedAt,
      delayed
    };
  } catch (error) {
    if (requestId !== intercityRealtimeRequest) return;
    intercityRealtimeState = {
      connected: false,
      reason: navigator.onLine ? 'api-error' : 'offline',
      items: [],
      updatedAt: null,
      delayed: false
    };
  } finally {
    clearTimeout(timeout);
    if (requestId === intercityRealtimeRequest) updateBusBoard(busData);
  }
}

function getConfiguredWorkerEndpoint(value) {
  try {
    const url = new URL(value);
    const validHost = url.hostname.endsWith('.workers.dev');
    const validPath = url.pathname === '/v1/bus-arrivals';
    const hasNoExtras = !url.search && !url.hash && !url.username && !url.password && !url.port;
    return url.protocol === 'https:' && validHost && validPath && hasNoExtras ? url.toString() : '';
  } catch {
    return '';
  }
}

function getKoreaTimeParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: weekdayMap[parts.weekday],
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    dateString: `${parts.year}-${parts.month}-${parts.day}`,
    minutesNow: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60
  };
}

function renderShuttleRoutes(busData, timeParts) {
  const container = document.getElementById('shuttle-routes');
  const isHoliday = busData.holidays.includes(timeParts.dateString);
  const isWeekday = timeParts.weekday >= 1 && timeParts.weekday <= 5;
  const fragment = document.createDocumentFragment();

  if (isWeekday && !isHoliday) {
    const visibleRoutes = busData.shuttle.weekdayRoutes.filter(route => !hiddenShuttleRoutes.has(route.id));
    visibleRoutes.forEach(route => fragment.appendChild(createShuttleRoute(route, timeParts)));
    if (visibleRoutes.length === 0) {
      fragment.appendChild(createServiceStatus('설정에서 표시할 셔틀 노선을 선택하세요.'));
    }
  } else if (timeParts.weekday === 0 && !isHoliday) {
    const cRoute = busData.shuttle.sundayRoute;
    if (hiddenShuttleRoutes.has('C')) {
      fragment.appendChild(createServiceStatus('설정에서 C노선 표시가 꺼져 있습니다.'));
    } else {
      const hasUpcomingBus = cRoute.directions.some(direction => (
        getNextDeparture(direction.departures, timeParts) !== null
      ));
      fragment.appendChild(hasUpcomingBus
        ? createShuttleRoute(cRoute, timeParts)
        : createServiceStatus('C노선 오늘 운행 종료'));
    }
  } else {
    const statusText = isHoliday
      ? '오늘은 공휴일로 교내 셔틀을 운행하지 않습니다.'
      : '토요일에는 교내 셔틀을 운행하지 않습니다.';
    fragment.appendChild(createServiceStatus(statusText));
  }

  container.replaceChildren(fragment);
}

function createShuttleRoute(route, timeParts) {
  const article = document.createElement('article');
  article.className = 'shuttle-route';
  article.dataset.route = route.id;

  const heading = document.createElement('div');
  heading.className = 'shuttle-route-heading';
  const badge = document.createElement('span');
  badge.className = `route-badge route-${route.id.toLowerCase()}`;
  badge.textContent = route.id;
  const titleBox = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = route.title;
  titleBox.appendChild(title);

  if (route.subtitle) {
    const subtitle = document.createElement('small');
    subtitle.textContent = route.subtitle;
    titleBox.appendChild(subtitle);
  }

  heading.append(badge, titleBox);
  article.appendChild(heading);
  const directionGrid = document.createElement('div');
  directionGrid.className = 'bus-direction-grid';
  route.directions.forEach(direction => {
    directionGrid.appendChild(createDirectionRow(direction, timeParts));
  });
  article.appendChild(directionGrid);
  return article;
}

function createDirectionRow(direction, timeParts) {
  const row = document.createElement('div');
  row.className = 'bus-direction';
  const label = document.createElement('span');
  label.className = 'bus-direction-label';
  label.textContent = direction.label;
  const next = getNextDeparture(direction.departures, timeParts);
  const nextBox = document.createElement('span');
  nextBox.className = 'bus-next';

  if (next) {
    const time = document.createElement('strong');
    time.textContent = next.time;
    const eta = document.createElement('small');
    eta.textContent = formatMinutesUntil(next.minutesUntil);
    nextBox.append(time, eta);
    if (next.note) {
      const note = document.createElement('small');
      note.className = 'bus-note';
      note.textContent = next.note;
      nextBox.appendChild(note);
    }
  } else {
    const ended = document.createElement('small');
    ended.className = 'bus-ended';
    ended.textContent = '오늘 운행 종료';
    nextBox.appendChild(ended);
  }

  row.append(label, nextBox);
  return row;
}

function renderIntercityRoutes(busData, timeParts, realtimeState) {
  const container = document.getElementById('intercity-routes');
  const isHoliday = busData.holidays.includes(timeParts.dateString);
  const fragment = document.createDocumentFragment();
  const realtimeEligibleRoutes = busData.intercity.filter(route => route.realtimeEligible !== false);
  let liveRouteCount = 0;
  let currentGroup = '';

  busData.intercity.forEach(route => {
    const group = route.group || 'direct';
    if (group !== currentGroup) {
      const groupLabel = document.createElement('div');
      groupLabel.className = 'intercity-group-label';
      groupLabel.textContent = group === 'replacement' ? '폐선·대체 노선' : '학교 정류장 출발';
      fragment.appendChild(groupLabel);
      currentGroup = group;
    }

    const liveItem = selectLiveArrivalForRoute(realtimeState.items, route);
    if (liveItem) liveRouteCount += 1;

    const row = document.createElement('article');
    row.className = `intercity-route${group === 'replacement' ? ' is-replacement' : ''}`;
    row.dataset.route = route.replacementNumber || route.number;
    row.dataset.source = route.status || (liveItem ? 'live' : 'schedule');

    const header = document.createElement('div');
    header.className = 'intercity-route-header';
    const routeNumbers = createIntercityRouteNumbers(route);
    const destination = document.createElement('span');
    destination.className = 'intercity-destination';
    destination.textContent = route.destination;
    const source = document.createElement('span');
    source.className = `intercity-source ${getIntercitySourceClass(route, liveItem, realtimeState)}`;
    source.textContent = getIntercitySourceLabel(route, liveItem, realtimeState);
    header.append(routeNumbers, destination, source);

    if (group === 'replacement') {
      row.append(header, createIntercityReplacementNotice(route));
    } else {
      const arrivals = document.createElement('div');
      arrivals.className = 'intercity-arrival-grid';

      if (liveItem) {
        arrivals.append(
          createLiveArrivalCell('이번 도착버스', liveItem, 1),
          createLiveArrivalCell('다음 도착버스', liveItem, 2)
        );
      } else {
        const schedule = resolveIntercitySchedule(busData, route);
        const departures = selectIntercityDepartures(schedule, timeParts.weekday, isHoliday);
        const nextDepartures = getNextDepartures(departures, timeParts, 2);
        arrivals.append(
          createScheduleArrivalCell('다음 출발', nextDepartures[0]),
          createScheduleArrivalCell('그 다음 출발', nextDepartures[1])
        );
      }

      row.append(header, arrivals);
      if (!liveItem && route.scheduleGroup) {
        row.appendChild(createIntercityScheduleGroupNote(resolveIntercitySchedule(busData, route)));
      }
    }

    fragment.appendChild(row);
  });

  container.replaceChildren(fragment);
  renderIntercityRealtimeStatus(realtimeState, liveRouteCount, realtimeEligibleRoutes.length);
}

function createIntercityRouteNumbers(route) {
  const numbers = document.createElement('span');
  numbers.className = 'intercity-number-chain';

  if (route.replacementNumber) {
    const retiredNumber = document.createElement('span');
    retiredNumber.className = 'intercity-number is-retired';
    retiredNumber.textContent = route.number;

    const arrow = document.createElement('span');
    arrow.className = 'intercity-number-arrow';
    arrow.textContent = '→';

    const replacementNumber = document.createElement('strong');
    replacementNumber.className = `intercity-number route-${route.routeStyle || 'default'}`;
    replacementNumber.textContent = route.replacementNumber;

    numbers.append(retiredNumber, arrow, replacementNumber);
    numbers.setAttribute('aria-label', `${route.number} 폐선, ${route.replacementNumber} ${route.statusLabel || '대체 노선'}`);
    return numbers;
  }

  const number = document.createElement('strong');
  number.className = `intercity-number route-${route.routeStyle || 'default'}`;
  number.textContent = route.number;
  numbers.appendChild(number);
  return numbers;
}

function getIntercitySourceClass(route, liveItem, realtimeState) {
  if (route.status === 'planned') return 'is-planned';
  if (route.status === 'operating') return 'is-operating';
  if (liveItem && realtimeState.delayed) return 'is-delayed';
  return liveItem ? 'is-live' : 'is-schedule';
}

function getIntercitySourceLabel(route, liveItem, realtimeState) {
  if (route.statusLabel) return route.statusLabel;
  if (liveItem && realtimeState.delayed) return '지연 정보';
  if (liveItem) return '실시간';
  return route.scheduleGroup ? '공동 시간표' : '시간표';
}

function createIntercityReplacementNotice(route) {
  const notice = document.createElement('div');
  notice.className = `intercity-replacement-notice is-${route.status || 'info'}`;

  const title = document.createElement('strong');
  title.textContent = route.noticeTitle;
  const detail = document.createElement('small');
  detail.textContent = route.noticeDetail;

  notice.append(title, detail);
  return notice;
}

function selectLiveArrivalForRoute(items, route) {
  const liveRouteNames = route.liveRouteNames || [];
  const liveDestinationKeywords = route.liveDestinationKeywords || [];
  const candidates = items.filter(item => (
    liveRouteNames.includes(String(item.routeName || '').trim())
  ));
  const directionCandidates = liveDestinationKeywords.length > 0
    ? candidates.filter(item => {
      const destination = normalizeBusName(item.routeDestName);
      return liveDestinationKeywords.some(keyword => (
        destination.includes(normalizeBusName(keyword))
      ));
    })
    : candidates;
  const usableCandidates = directionCandidates.filter(hasUsableArrivalData);
  if (usableCandidates.length === 0) return null;

  return usableCandidates.find(item => String(item.flag || '').toUpperCase() === 'WAIT') || usableCandidates[0];
}

function hasUsableArrivalData(item) {
  const flag = String(item.flag || '').toUpperCase();
  if (flag === 'WAIT' || flag === 'STOP') return true;

  return [1, 2].some(index => {
    return hasNonNegativeNumber(item[`predictTime${index}`]) ||
      hasNonNegativeNumber(item[`predictTimeSec${index}`]);
  });
}

function hasNonNegativeNumber(value) {
  if (value === '' || value === null || value === undefined) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function normalizeBusName(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function createLiveArrivalCell(labelText, item, index) {
  const cell = document.createElement('div');
  cell.className = 'intercity-arrival';
  const label = document.createElement('span');
  label.className = 'intercity-arrival-label';
  label.textContent = labelText;
  const main = document.createElement('strong');
  main.className = 'intercity-arrival-main';
  const detail = document.createElement('small');
  detail.className = 'intercity-arrival-detail';

  const flag = String(item.flag || '').toUpperCase();
  const minutes = getArrivalMinutes(item, index);
  const locationNo = Number(item[`locationNo${index}`]);

  if (flag === 'WAIT' && index === 1) {
    main.textContent = '회차 대기중';
    detail.textContent = '출발 준비 중';
  } else if (flag === 'STOP') {
    main.textContent = index === 1 ? '운행 종료' : '다음 차량 없음';
    detail.textContent = '';
  } else if (Number.isFinite(minutes) && minutes >= 0) {
    main.textContent = minutes <= 0 ? '곧 도착 예정' : `${minutes}분 후 도착 예정`;
    detail.textContent = locationNo > 0 ? `(${locationNo}정류장 전)` : '(정류장 진입)';
  } else if (flag === 'WAIT') {
    main.textContent = '다음 차량 정보 없음';
    detail.textContent = '';
  } else {
    main.textContent = '도착 정보 확인 중';
    detail.textContent = '';
  }

  cell.append(label, main);
  if (detail.textContent) cell.appendChild(detail);
  return cell;
}

function getArrivalMinutes(item, index) {
  const minuteValue = item[`predictTime${index}`];
  if (hasNonNegativeNumber(minuteValue)) return Number(minuteValue);

  const secondValue = item[`predictTimeSec${index}`];
  return hasNonNegativeNumber(secondValue) ? Math.ceil(Number(secondValue) / 60) : NaN;
}

function createScheduleArrivalCell(labelText, departure) {
  const cell = document.createElement('div');
  cell.className = 'intercity-arrival is-schedule';
  const label = document.createElement('span');
  label.className = 'intercity-arrival-label';
  label.textContent = labelText;
  const main = document.createElement('strong');
  main.className = 'intercity-arrival-main schedule-time';
  const detail = document.createElement('small');
  detail.className = 'intercity-arrival-detail';

  if (departure) {
    main.textContent = departure.time;
    detail.textContent = `${formatMinutesUntil(departure.minutesUntil).replace('곧 출발', '곧 출발 예정')}`;
  } else {
    main.textContent = labelText === '다음 출발' ? '오늘 운행 종료' : '시간표 없음';
    detail.textContent = '';
  }

  cell.append(label, main);
  if (detail.textContent) cell.appendChild(detail);
  if (departure?.note) {
    const note = document.createElement('small');
    note.className = 'intercity-schedule-note';
    note.textContent = departure.note;
    cell.appendChild(note);
  }
  return cell;
}

function createIntercityScheduleGroupNote(schedule) {
  const note = document.createElement('p');
  note.className = 'intercity-schedule-group-note';
  const parts = [schedule?.label || '계통 공동 시간표'];
  if (schedule?.sourceLabel) parts.push(schedule.sourceLabel);
  if (schedule?.sourceCheckedAt) parts.push(`${schedule.sourceCheckedAt} 확인`);
  note.textContent = parts.join(' · ');
  return note;
}

function renderIntercityRealtimeStatus(state, liveRouteCount, totalRouteCount) {
  const status = document.getElementById('intercity-live-status');
  const updatedAt = document.getElementById('intercity-updated-at');
  status.className = 'bus-data-mode';

  if (state.connected && state.delayed) {
    status.classList.add('is-delayed');
    status.textContent = '실시간 정보 갱신 지연';
  } else if (state.connected && liveRouteCount === totalRouteCount) {
    status.classList.add('is-live');
    status.textContent = '실시간 도착정보';
  } else if (state.connected && liveRouteCount > 0) {
    status.classList.add('is-mixed');
    status.textContent = '실시간 + 시간표';
  } else if (state.connected) {
    status.classList.add('is-fallback');
    status.textContent = '실시간 운행정보 없음 · 시간표';
  } else if (state.reason === 'offline') {
    status.classList.add('is-fallback');
    status.textContent = '오프라인 · 시간표 기준';
  } else if (state.reason === 'api-error') {
    status.classList.add('is-fallback');
    status.textContent = '현재 실시간 정보 제공이 불가능합니다.';
  } else {
    status.classList.add('is-loading');
    status.textContent = '실시간 연결 중 · 시간표 기준';
  }

  if (state.updatedAt) {
    const parts = getKoreaTimeParts(state.updatedAt, 'Asia/Seoul');
    updatedAt.textContent = `${parts.hour}:${parts.minute} 서버 갱신`;
  } else {
    updatedAt.textContent = state.reason === 'api-error'
      ? '저장된 시간표로 전환했습니다.'
      : '저장된 시간표 표시 중';
  }
}

function resolveIntercitySchedule(busData, route) {
  if (!route.scheduleGroup) return route;
  return busData.intercityScheduleGroups?.[route.scheduleGroup] || route;
}

function selectIntercityDepartures(schedule, weekday, isHoliday) {
  if (!schedule?.departuresByDay) return Array.isArray(schedule?.departures) ? schedule.departures : [];
  if (isHoliday || weekday === 0) return schedule.departuresByDay.sundayOrHoliday || [];
  if (weekday === 6) return schedule.departuresByDay.saturday || [];
  return schedule.departuresByDay.weekday || [];
}

function getNextDeparture(departures, timeParts) {
  return getNextDepartures(departures, timeParts, 1)[0] || null;
}

function getNextDepartures(departures, timeParts, limit) {
  const results = [];
  for (const departure of departures) {
    const normalized = typeof departure === 'string' ? { time: departure } : departure;
    const [hour, minute] = normalized.time.split(':').map(Number);
    const departureMinutes = hour * 60 + minute;

    if (departureMinutes >= timeParts.minutesNow) {
      const appliesToday = !normalized.noteWeekdays || normalized.noteWeekdays.includes(timeParts.weekday);
      results.push({
        time: normalized.time,
        note: appliesToday ? normalized.note : '',
        minutesUntil: Math.max(0, Math.ceil(departureMinutes - timeParts.minutesNow))
      });
      if (results.length >= limit) break;
    }
  }
  return results;
}

function formatMinutesUntil(minutes) {
  if (minutes <= 1) return '곧 출발';
  if (minutes < 60) return `${minutes}분 후`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}시간 ${remainder}분 후` : `${hours}시간 후`;
}

function createServiceStatus(text) {
  const status = document.createElement('p');
  status.className = 'bus-service-status';
  status.textContent = text;
  return status;
}

function arraysEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}
