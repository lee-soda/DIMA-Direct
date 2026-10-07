const MIN_SHORTCUTS = 4;
const DEFAULT_SHORTCUTS = [
  '홈페이지', '인트라넷', 'DIMA C', '헤이영', 'LMS', '버스시간표',
  '공지사항', '에브리타임', '장비대여', '시간표 조회', '도서관', '나의 학과'
];
const SHORTCUT_NAME_MIGRATIONS = {
  '학사일정': '헤이영',
  '외출외박신청': '기숙사 외출 · 외박'
};

const DEFAULT_SETTINGS = {
  Color: 'white',
  ShortcutView: 'icons',
  Department: '나의 학과',
  Shortcuts: [...DEFAULT_SHORTCUTS],
  Link1: '홈페이지',
  Link2: '인트라넷',
  Link3: 'DIMA C',
  Link4: '헤이영',
  Link5: 'LMS',
  Link6: '버스시간표',
  Link7: '공지사항',
  Link8: '에브리타임',
  Link9: '장비대여',
  Link10: '시간표 조회',
  Link11: '도서관',
  Link12: '나의 학과',
  MainSectionOrder: ['shortcuts', 'schedule', 'shuttle', 'intercity'],
  HiddenMainSections: ['schedule'],
  HiddenShuttleRoutes: []
};

const MAIN_SECTION_DEFINITIONS = {
  shortcuts: { label: '바로가기', description: '원하는 만큼 구성하는 빠른 실행 버튼' },
  schedule: { label: '학사일정', description: '오늘의 학사일정 요약' },
  shuttle: { label: '셔틀버스', description: '교내 A·B·C 노선의 다음 출발' },
  intercity: { label: '시외버스', description: '학교 출발 시외버스의 다음 출발' }
};

const SHUTTLE_ROUTE_IDS = ['A', 'B', 'C'];

const LEGACY_DEPARTMENT_NAMES = {
  '성악(보컬)과': '보컬과'
};

let departmentData = {};
let pageData = {};
let selectedDepartment = '';
let mainSectionOrder = [...DEFAULT_SETTINGS.MainSectionOrder];
let hiddenMainSections = new Set(DEFAULT_SETTINGS.HiddenMainSections);
let hiddenShuttleRoutes = new Set(DEFAULT_SETTINGS.HiddenShuttleRoutes);
let shortcutValues = [];
let activeShortcutIndex = 0;
let dragState = null;
let toastTimer;
let departmentNoticeTimer;

window.addEventListener('DOMContentLoaded', initializeOptions);

async function initializeOptions() {
  try {
    [departmentData, pageData] = await Promise.all([
      fetchJson('../data/department.json'),
      fetchJson('../data/page.json')
    ]);

    bindStaticEvents();
    await Promise.all([
      loadSelectedDepartment(),
      loadThemeOptions(),
      loadShortcutViewOption(),
      loadLinkOptions(),
      loadMainLayoutOptions()
    ]);
    renderDepartmentList();
    setDepartmentSectionExpanded(!selectedDepartment);
  } catch (error) {
    console.error('설정 화면을 불러오지 못했습니다.', error);
  }
}

function bindStaticEvents() {
  document.getElementById('theme-buttons').addEventListener('click', async event => {
    const button = event.target.closest('[data-color]');
    if (!button) return;

    const color = button.dataset.color;
    applyTheme(color);
    await setChromeStorageData({ Color: color });
    showApplyMessage(`${color === 'black' ? '다크' : '라이트'} 테마로 변경했습니다.`);
  });

  document.getElementById('department-groups').addEventListener('click', async event => {
    const button = event.target.closest('[data-department]');
    if (!button) return;

    const departmentName = button.dataset.department;
    if (!departmentData[departmentName]) return;

    selectedDepartment = departmentName;
    await setChromeStorageData({ Department: departmentName });
    updateCurrentDepartment();
    renderDepartmentList(document.getElementById('department-search').value);
    showDepartmentChangeMessage();
  });

  const searchInput = document.getElementById('department-search');
  searchInput.addEventListener('input', () => renderDepartmentList(searchInput.value));
  searchInput.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    searchInput.value = '';
    renderDepartmentList();
    searchInput.focus();
  });

  document.getElementById('btn-reset-settings').addEventListener('click', resetSettings);
  document.getElementById('main-layout-list').addEventListener('click', handleMainLayoutClick);
  document.getElementById('main-layout-list').addEventListener('keydown', handleMainLayoutKeydown);
  document.getElementById('main-layout-list').addEventListener('dragstart', handleMainLayoutDragStart);
  document.getElementById('main-layout-list').addEventListener('dragover', handleMainLayoutDragOver);
  document.getElementById('main-layout-list').addEventListener('drop', handleMainLayoutDrop);
  document.getElementById('main-layout-list').addEventListener('dragend', clearDragStyles);
  document.getElementById('shortcut-library').addEventListener('click', handleShortcutLibraryClick);
  document.getElementById('shortcut-library').addEventListener('dragstart', handleShortcutLibraryDragStart);
  document.getElementById('shortcut-library').addEventListener('dragend', clearDragStyles);
  document.getElementById('links-grid').addEventListener('click', handleShortcutSlotClick);
  document.getElementById('links-grid').addEventListener('keydown', handleShortcutSlotKeydown);
  document.getElementById('links-grid').addEventListener('dragstart', handleShortcutSlotDragStart);
  document.getElementById('links-grid').addEventListener('dragover', handleShortcutSlotDragOver);
  document.getElementById('links-grid').addEventListener('drop', handleShortcutSlotDrop);
  document.getElementById('links-grid').addEventListener('dragend', clearDragStyles);
  document.getElementById('shortcut-view-buttons').addEventListener('click', async event => {
    const button = event.target.closest('[data-shortcut-view]');
    if (!button) return;
    const view = button.dataset.shortcutView;
    applyShortcutViewSelection(view);
    await setChromeStorageData({ ShortcutView: view });
    showApplyMessage(`${view === 'compact' ? '간략형' : '이미지형'} 바로가기로 변경했습니다.`);
  });
  document.getElementById('department-toggle').addEventListener('click', () => {
    const toggle = document.getElementById('department-toggle');
    setDepartmentSectionExpanded(toggle.getAttribute('aria-expanded') !== 'true');
  });
  document.querySelectorAll('[data-settings-link]').forEach(link => {
    link.addEventListener('click', handleSettingsLinkClick);
  });
  document.getElementById('department-collapse-bottom').addEventListener('click', collapseDepartmentFromBottom);
}

function handleSettingsLinkClick(event) {
  const targetSelector = event.currentTarget.getAttribute('href');
  if (!targetSelector?.startsWith('#')) return;

  const target = document.querySelector(targetSelector);
  if (!target) return;
  event.preventDefault();

  if (target.id === 'department-settings') {
    setDepartmentSectionExpanded(true);
  }

  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: getSettingsScrollBehavior(), block: 'start' });
    history.replaceState(null, '', targetSelector);
  });
}

function collapseDepartmentFromBottom() {
  const card = document.getElementById('department-settings');
  const toggle = document.getElementById('department-toggle');
  setDepartmentSectionExpanded(false);
  card.scrollIntoView({ behavior: getSettingsScrollBehavior(), block: 'start' });
  toggle.focus({ preventScroll: true });
}

function getSettingsScrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

async function loadSelectedDepartment() {
  const { Department } = await getChromeStorageData(['Department']);
  const migratedName = LEGACY_DEPARTMENT_NAMES[Department] || Department;

  if (migratedName && departmentData[migratedName]?.group) {
    selectedDepartment = migratedName;
    if (migratedName !== Department) {
      await setChromeStorageData({ Department: migratedName });
    }
  } else {
    selectedDepartment = '';
    if (Department && Department !== '나의 학과') {
      await setChromeStorageData({ Department: '나의 학과' });
    }
  }

  updateCurrentDepartment();
}

function updateCurrentDepartment() {
  const nameElement = document.getElementById('current-department-name');
  const groupElement = document.getElementById('current-department-group');
  const linkElement = document.getElementById('current-department-link');
  const badge = document.querySelector('.current-badge');
  const details = departmentData[selectedDepartment];

  if (!selectedDepartment || !details) {
    nameElement.textContent = '선택된 학과 없음';
    groupElement.textContent = '아래 목록에서 학과를 선택하세요.';
    linkElement.textContent = '학과 선택하기';
    linkElement.href = '#department-settings';
    linkElement.removeAttribute('target');
    linkElement.removeAttribute('rel');
    badge.hidden = true;
    return;
  }

  nameElement.textContent = selectedDepartment;
  groupElement.textContent = details.group;
  linkElement.textContent = '공식 페이지 열기';
  linkElement.href = details.URL;
  linkElement.target = '_blank';
  linkElement.rel = 'noreferrer';
  badge.hidden = false;
}

function renderDepartmentList(query = '') {
  const container = document.getElementById('department-groups');
  const emptyState = document.getElementById('department-empty');
  const resultCount = document.getElementById('department-result-count');
  const normalizedQuery = normalizeSearchText(query);
  const exactAliasDepartmentNames = getExactAliasDepartmentNames(normalizedQuery);
  const hasExactAliasMatches = exactAliasDepartmentNames.size > 0;
  const groups = new Map();

  Object.entries(departmentData).forEach(([name, details]) => {
    if (!details.group) return;
    if (!groups.has(details.group)) {
      groups.set(details.group, {
        name: details.group,
        departments: []
      });
    }
    groups.get(details.group).departments.push({ name, ...details });
  });

  container.innerHTML = '';
  let visibleDepartmentCount = 0;

  groups.forEach(group => {
    const groupMatches = !hasExactAliasMatches && normalizeSearchText(group.name).includes(normalizedQuery);
    const visibleDepartments = group.departments.filter(department => {
      if (hasExactAliasMatches) return exactAliasDepartmentNames.has(department.name);
      return !normalizedQuery || groupMatches || departmentMatchesSearch(department, normalizedQuery);
    });

    if (visibleDepartments.length === 0) return;
    visibleDepartmentCount += visibleDepartments.length;

    const groupSection = document.createElement('section');
    groupSection.className = 'department-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'department-group-header';

    const groupTitleWrap = document.createElement('div');
    const groupTitle = document.createElement('h3');
    groupTitle.textContent = group.name;
    const groupCount = document.createElement('span');
    groupCount.textContent = `${group.departments.length}개`;
    groupTitleWrap.append(groupTitle, groupCount);

    groupHeader.appendChild(groupTitleWrap);

    const options = document.createElement('div');
    options.className = 'department-options';

    visibleDepartments.forEach(department => {
      const isSelected = department.name === selectedDepartment;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `department-option${isSelected ? ' is-selected' : ''}`;
      button.dataset.department = department.name;
      button.setAttribute('aria-pressed', String(isSelected));

      const label = document.createElement('span');
      label.textContent = department.name;
      const mark = document.createElement('span');
      mark.className = 'department-check';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = isSelected ? '✓' : '›';
      button.append(label, mark);
      options.appendChild(button);
    });

    groupSection.append(groupHeader, options);
    container.appendChild(groupSection);
  });

  emptyState.hidden = visibleDepartmentCount !== 0;
  resultCount.textContent = normalizedQuery
    ? `${visibleDepartmentCount}개 학과 검색됨`
    : `${groups.size}개 학부·과정으로 분류`;
}

function setDepartmentSectionExpanded(isExpanded) {
  const card = document.getElementById('department-settings');
  const toggle = document.getElementById('department-toggle');
  const content = document.getElementById('department-selector-content');

  content.hidden = !isExpanded;
  card.classList.toggle('is-collapsed', !isExpanded);
  toggle.setAttribute('aria-expanded', String(isExpanded));
  toggle.querySelector('.section-toggle-label').textContent = isExpanded ? '접기' : '펼치기';
}

function getDepartmentCount() {
  return Object.values(departmentData).filter(details => Boolean(details.group)).length;
}

function normalizeSearchText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

function departmentMatchesSearch(department, normalizedQuery) {
  if (normalizeSearchText(department.name).includes(normalizedQuery)) return true;

  return (department.searchAliases || []).some(alias => {
    return normalizeSearchText(alias).includes(normalizedQuery);
  });
}

function getExactAliasDepartmentNames(normalizedQuery) {
  if (!normalizedQuery) return new Set();

  return new Set(
    Object.entries(departmentData)
      .filter(([, details]) => {
        return details.group && (details.searchAliases || []).some(alias => {
          return normalizeSearchText(alias) === normalizedQuery;
        });
      })
      .map(([name]) => name)
  );
}

async function loadThemeOptions() {
  const { Color } = await getChromeStorageData(['Color']);
  applyTheme(Color === 'black' ? 'black' : 'white');
}

function applyTheme(color) {
  const isDark = color === 'black';
  document.body.dataset.theme = isDark ? 'dark' : 'light';
  document.querySelectorAll('[data-color]').forEach(button => {
    const isSelected = button.dataset.color === color;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

async function loadShortcutViewOption() {
  const { ShortcutView } = await getChromeStorageData(['ShortcutView']);
  const normalizedView = ShortcutView === 'compact' ? 'compact' : 'icons';
  applyShortcutViewSelection(normalizedView);
  if (ShortcutView !== normalizedView) {
    await setChromeStorageData({ ShortcutView: normalizedView });
  }
}

function applyShortcutViewSelection(view) {
  document.querySelectorAll('[data-shortcut-view]').forEach(button => {
    const isSelected = button.dataset.shortcutView === view;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  });
}

async function loadMainLayoutOptions() {
  const stored = await getChromeStorageData([
    'MainSectionOrder',
    'HiddenMainSections',
    'HiddenShuttleRoutes'
  ]);
  const validIds = Object.keys(MAIN_SECTION_DEFINITIONS);
  const storedOrder = Array.isArray(stored.MainSectionOrder) ? stored.MainSectionOrder : [];

  mainSectionOrder = [
    ...new Set(storedOrder.filter(id => validIds.includes(id))),
    ...validIds.filter(id => !storedOrder.includes(id))
  ];
  hiddenMainSections = new Set(
    Array.isArray(stored.HiddenMainSections)
      ? stored.HiddenMainSections.filter(id => validIds.includes(id))
      : DEFAULT_SETTINGS.HiddenMainSections
  );
  hiddenShuttleRoutes = new Set(
    Array.isArray(stored.HiddenShuttleRoutes)
      ? stored.HiddenShuttleRoutes
        .map(route => String(route).toUpperCase())
        .filter(route => SHUTTLE_ROUTE_IDS.includes(route))
      : DEFAULT_SETTINGS.HiddenShuttleRoutes
  );

  const normalized = {
    MainSectionOrder: [...mainSectionOrder],
    HiddenMainSections: [...hiddenMainSections],
    HiddenShuttleRoutes: [...hiddenShuttleRoutes]
  };
  if (
    !arraysEqual(stored.MainSectionOrder, normalized.MainSectionOrder) ||
    !arraysEqual(stored.HiddenMainSections, normalized.HiddenMainSections) ||
    !arraysEqual(stored.HiddenShuttleRoutes, normalized.HiddenShuttleRoutes)
  ) {
    await setChromeStorageData(normalized);
  }

  renderMainLayoutOptions();
}

function renderMainLayoutOptions() {
  const container = document.getElementById('main-layout-list');
  container.innerHTML = '';

  mainSectionOrder.forEach((id, index) => {
    const definition = MAIN_SECTION_DEFINITIONS[id];
    const isVisible = !hiddenMainSections.has(id);
    const row = document.createElement('article');
    row.className = `layout-row${isVisible ? '' : ' is-hidden'}`;
    row.dataset.sectionId = id;
    row.draggable = true;

    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'drag-handle';
    dragHandle.dataset.action = 'drag-handle';
    dragHandle.setAttribute('aria-label', `${definition.label} 순서 이동`);
    dragHandle.title = '끌어서 순서 변경';
    const dragDots = document.createElement('span');
    dragDots.className = 'drag-dots';
    dragDots.setAttribute('aria-hidden', 'true');
    dragHandle.appendChild(dragDots);

    const position = document.createElement('span');
    position.className = 'layout-position';
    position.textContent = String(index + 1).padStart(2, '0');
    position.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('div');
    copy.className = 'layout-copy';
    const title = document.createElement('h3');
    title.textContent = definition.label;
    const description = document.createElement('p');
    description.textContent = definition.description;
    copy.append(title, description);

    const extras = document.createElement('div');
    extras.className = 'layout-extras';
    if (id === 'shuttle') {
      const routeLabel = document.createElement('span');
      routeLabel.className = 'route-control-label';
      routeLabel.textContent = '표시 노선';
      extras.appendChild(routeLabel);

      SHUTTLE_ROUTE_IDS.forEach(route => {
        const routeButton = document.createElement('button');
        const routeVisible = !hiddenShuttleRoutes.has(route);
        routeButton.type = 'button';
        routeButton.className = 'route-toggle';
        routeButton.dataset.action = 'toggle-route';
        routeButton.dataset.route = route;
        routeButton.setAttribute('aria-pressed', String(routeVisible));
        routeButton.setAttribute('aria-label', `셔틀버스 ${route}노선 ${routeVisible ? '숨기기' : '표시하기'}`);
        routeButton.textContent = route;
        extras.appendChild(routeButton);
      });
    }

    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'visibility-toggle';
    visibility.dataset.action = 'toggle-visibility';
    visibility.setAttribute('role', 'switch');
    visibility.setAttribute('aria-checked', String(isVisible));
    visibility.setAttribute('aria-label', `${definition.label} ${isVisible ? '숨기기' : '표시하기'}`);
    const visibilityText = document.createElement('span');
    visibilityText.textContent = isVisible ? '표시' : '숨김';
    const switchTrack = document.createElement('span');
    switchTrack.className = 'switch-track';
    switchTrack.setAttribute('aria-hidden', 'true');
    visibility.append(visibilityText, switchTrack);

    row.append(dragHandle, position, copy, extras, visibility);
    container.appendChild(row);
  });
}

async function handleMainLayoutClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'drag-handle') return;
  const row = button.closest('[data-section-id]');
  if (!row) return;
  const sectionId = row.dataset.sectionId;
  const sectionLabel = MAIN_SECTION_DEFINITIONS[sectionId].label;

  if (button.dataset.action === 'toggle-visibility') {
    if (hiddenMainSections.has(sectionId)) {
      hiddenMainSections.delete(sectionId);
      showApplyMessage(`${sectionLabel} 섹터를 표시합니다.`);
    } else {
      hiddenMainSections.add(sectionId);
      showApplyMessage(`${sectionLabel} 섹터를 숨겼습니다.`);
    }
    await setChromeStorageData({ HiddenMainSections: [...hiddenMainSections] });
  }

  if (button.dataset.action === 'toggle-route') {
    const route = button.dataset.route;
    if (hiddenShuttleRoutes.has(route)) {
      hiddenShuttleRoutes.delete(route);
      showApplyMessage(`셔틀버스 ${route}노선을 표시합니다.`);
    } else {
      hiddenShuttleRoutes.add(route);
      showApplyMessage(`셔틀버스 ${route}노선을 숨겼습니다.`);
    }
    await setChromeStorageData({ HiddenShuttleRoutes: [...hiddenShuttleRoutes] });
  }

  renderMainLayoutOptions();
}

async function handleMainLayoutKeydown(event) {
  if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const handle = event.target.closest('.drag-handle');
  const row = handle?.closest('[data-section-id]');
  if (!row) return;
  event.preventDefault();
  const currentIndex = mainSectionOrder.indexOf(row.dataset.sectionId);
  const targetIndex = currentIndex + (event.key === 'ArrowUp' ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= mainSectionOrder.length) return;
  await moveMainSection(row.dataset.sectionId, targetIndex);
}

function handleMainLayoutDragStart(event) {
  const row = event.target.closest('[data-section-id]');
  if (!row) return;
  dragState = { type: 'main-section', sectionId: row.dataset.sectionId };
  row.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `section:${row.dataset.sectionId}`);
}

function handleMainLayoutDragOver(event) {
  if (dragState?.type !== 'main-section') return;
  const row = event.target.closest('[data-section-id]');
  if (!row || row.dataset.sectionId === dragState.sectionId) return;
  event.preventDefault();
  clearDropTargets();
  const position = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2
    ? 'before'
    : 'after';
  row.dataset.dropPosition = position;
  row.classList.add(`drop-${position}`);
  event.dataTransfer.dropEffect = 'move';
}

async function handleMainLayoutDrop(event) {
  if (dragState?.type !== 'main-section') return;
  const row = event.target.closest('[data-section-id]');
  if (!row || row.dataset.sectionId === dragState.sectionId) return;
  event.preventDefault();
  const sourceId = dragState.sectionId;
  const targetId = row.dataset.sectionId;
  const position = row.dataset.dropPosition || 'before';
  const nextOrder = mainSectionOrder.filter(id => id !== sourceId);
  let insertIndex = nextOrder.indexOf(targetId);
  if (position === 'after') insertIndex += 1;
  nextOrder.splice(insertIndex, 0, sourceId);
  mainSectionOrder = nextOrder;
  await setChromeStorageData({ MainSectionOrder: [...mainSectionOrder] });
  renderMainLayoutOptions();
  showApplyMessage(`${MAIN_SECTION_DEFINITIONS[sourceId].label} 섹터 순서를 변경했습니다.`);
  clearDragStyles();
}

async function moveMainSection(sectionId, targetIndex) {
  const currentIndex = mainSectionOrder.indexOf(sectionId);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= mainSectionOrder.length) return;
  const nextOrder = [...mainSectionOrder];
  const [moved] = nextOrder.splice(currentIndex, 1);
  nextOrder.splice(targetIndex, 0, moved);
  mainSectionOrder = nextOrder;
  await setChromeStorageData({ MainSectionOrder: [...mainSectionOrder] });
  renderMainLayoutOptions();
  document.querySelector(`[data-section-id="${sectionId}"] .drag-handle`)?.focus();
  showApplyMessage(`${MAIN_SECTION_DEFINITIONS[sectionId].label} 섹터 순서를 변경했습니다.`);
}

async function loadLinkOptions() {
  const linkKeys = Array.from({ length: 12 }, (_, index) => `Link${index + 1}`);
  const linkStorage = await getChromeStorageData(['Shortcuts', ...linkKeys]);
  const legacyValues = linkKeys.map(storageKey => linkStorage[storageKey]);
  const storedValues = Array.isArray(linkStorage.Shortcuts)
    ? linkStorage.Shortcuts
    : legacyValues;

  shortcutValues = normalizeShortcutValues(storedValues);
  if (!arraysEqual(linkStorage.Shortcuts, shortcutValues)) {
    await setChromeStorageData({ Shortcuts: [...shortcutValues] });
  }

  activeShortcutIndex = Math.max(0, Math.min(activeShortcutIndex, shortcutValues.length - 1));
  renderShortcutOptions();
}

function normalizeShortcutValues(values) {
  const normalized = (Array.isArray(values) ? values : [])
    .map(name => SHORTCUT_NAME_MIGRATIONS[name] || name)
    .filter(name => typeof name === 'string' && pageData[name]);

  for (const fallback of DEFAULT_SHORTCUTS) {
    if (normalized.length >= MIN_SHORTCUTS) break;
    if (pageData[fallback] && !normalized.includes(fallback)) normalized.push(fallback);
  }

  return normalized;
}

function renderShortcutOptions() {
  renderShortcutLibrary();
  renderShortcutLayout();
  document.getElementById('active-shortcut-label').textContent = `${activeShortcutIndex + 1}번 칸 선택됨`;
  document.getElementById('shortcut-count-label').textContent = `${shortcutValues.length}개 표시 중 · 최소 ${MIN_SHORTCUTS}개`;
}

function renderShortcutLibrary() {
  const library = document.getElementById('shortcut-library');
  library.innerHTML = '';

  Object.keys(pageData).forEach(name => {
    const button = document.createElement('button');
    const usedCount = shortcutValues.filter(value => value === name).length;
    button.type = 'button';
    button.className = 'shortcut-choice';
    button.dataset.linkName = name;
    button.draggable = true;
    button.setAttribute('aria-label', `${name} 바로가기 추가`);

    const label = document.createElement('span');
    label.textContent = name;
    button.appendChild(label);

    if (usedCount > 0) {
      const count = document.createElement('small');
      count.textContent = usedCount;
      count.title = `${usedCount}개 배치됨`;
      button.appendChild(count);
    }

    const addMark = document.createElement('span');
    addMark.className = 'shortcut-choice-add';
    addMark.textContent = '+';
    addMark.setAttribute('aria-hidden', 'true');
    button.appendChild(addMark);

    library.appendChild(button);
  });
}

function renderShortcutLayout() {
  const linkGrid = document.getElementById('links-grid');
  linkGrid.innerHTML = '';

  shortcutValues.forEach((name, index) => {
    const card = document.createElement('article');
    card.className = `shortcut-slot${index === activeShortcutIndex ? ' is-active' : ''}`;
    card.dataset.shortcutIndex = String(index);
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute('aria-label', `${index + 1}번 ${name}. 선택하거나 끌어서 순서 변경`);

    const number = document.createElement('span');
    number.className = 'shortcut-slot-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const label = document.createElement('strong');
    label.textContent = name;

    const handle = document.createElement('span');
    handle.className = 'drag-dots';
    handle.setAttribute('aria-hidden', 'true');

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'shortcut-remove';
    removeButton.dataset.action = 'remove-shortcut';
    removeButton.dataset.removeIndex = String(index);
    removeButton.textContent = '×';
    removeButton.disabled = shortcutValues.length <= MIN_SHORTCUTS;
    removeButton.title = removeButton.disabled
      ? `최소 ${MIN_SHORTCUTS}개는 유지해야 합니다.`
      : `${name} 바로가기 삭제`;
    removeButton.setAttribute('aria-label', `${name} 바로가기 삭제`);

    card.append(number, label, handle, removeButton);
    linkGrid.appendChild(card);
  });

  const addZone = document.createElement('div');
  addZone.className = 'shortcut-add-zone';
  addZone.dataset.shortcutAddZone = 'true';
  addZone.innerHTML = '<span aria-hidden="true">+</span><strong>바로가기 추가</strong><small>기능 버튼을 클릭하거나 여기로 끌어 놓으세요.</small>';
  linkGrid.appendChild(addZone);
}

async function handleShortcutLibraryClick(event) {
  const button = event.target.closest('[data-link-name]');
  if (!button) return;
  await appendShortcut(button.dataset.linkName);
}

function handleShortcutLibraryDragStart(event) {
  const button = event.target.closest('[data-link-name]');
  if (!button) return;
  dragState = { type: 'shortcut-choice', name: button.dataset.linkName };
  button.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', `shortcut:${button.dataset.linkName}`);
}

async function handleShortcutSlotClick(event) {
  const removeButton = event.target.closest('[data-action="remove-shortcut"]');
  if (removeButton) {
    await removeShortcut(Number(removeButton.dataset.removeIndex));
    return;
  }

  const slot = event.target.closest('[data-shortcut-index]');
  if (!slot) return;
  activeShortcutIndex = Number(slot.dataset.shortcutIndex);
  renderShortcutOptions();
  document.querySelector(`[data-shortcut-index="${activeShortcutIndex}"]`)?.focus();
}

async function handleShortcutSlotKeydown(event) {
  if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const slot = event.target.closest('[data-shortcut-index]');
  if (!slot) return;
  event.preventDefault();
  const sourceIndex = Number(slot.dataset.shortcutIndex);
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
  const targetIndex = sourceIndex + offsets[event.key];
  if (targetIndex < 0 || targetIndex >= shortcutValues.length) return;
  await moveShortcut(sourceIndex, targetIndex);
}

function handleShortcutSlotDragStart(event) {
  if (event.target.closest('button')) {
    event.preventDefault();
    return;
  }
  const slot = event.target.closest('[data-shortcut-index]');
  if (!slot) return;
  dragState = { type: 'shortcut-slot', sourceIndex: Number(slot.dataset.shortcutIndex) };
  slot.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `shortcut-slot:${slot.dataset.shortcutIndex}`);
}

function handleShortcutSlotDragOver(event) {
  if (!['shortcut-choice', 'shortcut-slot'].includes(dragState?.type)) return;
  const addZone = event.target.closest('[data-shortcut-add-zone]');
  const slot = event.target.closest('[data-shortcut-index]');
  const target = addZone || slot;
  if (!target) return;
  event.preventDefault();
  clearDropTargets();
  target.classList.add('is-drop-target');
  event.dataTransfer.dropEffect = dragState.type === 'shortcut-choice' ? 'copy' : 'move';
}

async function handleShortcutSlotDrop(event) {
  const addZone = event.target.closest('[data-shortcut-add-zone]');
  const slot = event.target.closest('[data-shortcut-index]');
  if ((!slot && !addZone) || !['shortcut-choice', 'shortcut-slot'].includes(dragState?.type)) return;
  event.preventDefault();
  const targetIndex = addZone ? shortcutValues.length - 1 : Number(slot.dataset.shortcutIndex);

  if (dragState.type === 'shortcut-choice') {
    if (addZone) {
      await appendShortcut(dragState.name);
    } else {
      await replaceShortcutAt(targetIndex, dragState.name);
    }
  } else if (dragState.sourceIndex !== targetIndex) {
    await moveShortcut(dragState.sourceIndex, targetIndex);
  }

  clearDragStyles();
}

async function replaceShortcutAt(index, name) {
  if (!pageData[name] || index < 0 || index >= shortcutValues.length) return;
  shortcutValues[index] = name;
  activeShortcutIndex = index;
  await persistShortcutValues();
  renderShortcutOptions();
  showApplyMessage(`${index + 1}번 칸에 ${name}(을)를 배치했습니다.`);
}

async function appendShortcut(name) {
  if (!pageData[name]) return;
  shortcutValues.push(name);
  activeShortcutIndex = shortcutValues.length - 1;
  await persistShortcutValues();
  renderShortcutOptions();
  document.querySelector(`[data-shortcut-index="${activeShortcutIndex}"]`)?.focus();
  showApplyMessage(`${name} 바로가기를 추가했습니다.`);
}

async function removeShortcut(index) {
  if (shortcutValues.length <= MIN_SHORTCUTS) {
    showApplyMessage(`바로가기는 최소 ${MIN_SHORTCUTS}개가 필요합니다.`);
    return;
  }
  if (index < 0 || index >= shortcutValues.length) return;

  const [removed] = shortcutValues.splice(index, 1);
  activeShortcutIndex = Math.max(0, Math.min(index, shortcutValues.length - 1));
  await persistShortcutValues();
  renderShortcutOptions();
  document.querySelector(`[data-shortcut-index="${activeShortcutIndex}"]`)?.focus();
  showApplyMessage(`${removed} 바로가기를 삭제했습니다.`);
}

async function moveShortcut(sourceIndex, targetIndex) {
  if (
    sourceIndex < 0 || sourceIndex >= shortcutValues.length ||
    targetIndex < 0 || targetIndex >= shortcutValues.length
  ) return;
  const nextValues = [...shortcutValues];
  const [moved] = nextValues.splice(sourceIndex, 1);
  nextValues.splice(targetIndex, 0, moved);
  shortcutValues = nextValues;
  activeShortcutIndex = targetIndex;
  await persistShortcutValues();
  renderShortcutOptions();
  document.querySelector(`[data-shortcut-index="${targetIndex}"]`)?.focus();
  showApplyMessage(`${moved} 바로가기 순서를 변경했습니다.`);
}

async function persistShortcutValues() {
  await setChromeStorageData({ Shortcuts: [...shortcutValues] });
}

function clearDropTargets() {
  document.querySelectorAll('.drop-before, .drop-after, .is-drop-target').forEach(element => {
    element.classList.remove('drop-before', 'drop-after', 'is-drop-target');
    delete element.dataset.dropPosition;
  });
}

function clearDragStyles() {
  document.querySelectorAll('.is-dragging').forEach(element => element.classList.remove('is-dragging'));
  clearDropTargets();
  dragState = null;
}

async function resetSettings() {
  const confirmed = window.confirm('테마, 바로가기 보기, 메인 화면 구성, 학과, 바로가기 설정을 모두 기본값으로 되돌릴까요?');
  if (!confirmed) return;

  await setChromeStorageData({
    ...DEFAULT_SETTINGS,
    Shortcuts: [...DEFAULT_SETTINGS.Shortcuts],
    MainSectionOrder: [...DEFAULT_SETTINGS.MainSectionOrder],
    HiddenMainSections: [...DEFAULT_SETTINGS.HiddenMainSections],
    HiddenShuttleRoutes: [...DEFAULT_SETTINGS.HiddenShuttleRoutes]
  });
  selectedDepartment = '';
  document.getElementById('department-search').value = '';
  applyTheme('white');
  applyShortcutViewSelection('icons');
  updateCurrentDepartment();
  renderDepartmentList();
  setDepartmentSectionExpanded(true);
  activeShortcutIndex = 0;
  await Promise.all([loadShortcutViewOption(), loadLinkOptions(), loadMainLayoutOptions()]);
  showApplyMessage('모든 설정을 기본값으로 초기화했습니다.');
}

function showApplyMessage(message) {
  const toast = document.getElementById('apply-message');
  document.getElementById('apply-message-text').textContent = message;
  toast.classList.add('is-visible');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2200);
}

function showDepartmentChangeMessage() {
  const notice = document.getElementById('department-change-status');
  notice.textContent = '✓ 학과가 변경되었습니다.';
  notice.hidden = false;
  requestAnimationFrame(() => notice.classList.add('is-visible'));

  clearTimeout(departmentNoticeTimer);
  departmentNoticeTimer = setTimeout(() => {
    notice.classList.remove('is-visible');

    setTimeout(() => {
      if (!notice.classList.contains('is-visible')) {
        notice.hidden = true;
        notice.textContent = '';
      }
    }, 180);
  }, 5000);
}

function arraysEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}
