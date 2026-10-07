const MIN_SHORTCUTS = 4;
const DEFAULT_SHORTCUTS = [
  '홈페이지', '인트라넷', 'DIMA C', '헤이영', 'LMS', '버스시간표',
  '공지사항', '에브리타임', '장비대여', '시간표 조회', '도서관', '나의 학과'
];
const SHORTCUT_NAME_MIGRATIONS = {
  '학사일정': '헤이영',
  '외출외박신청': '기숙사 외출 · 외박'
};
const LEGACY_LINK_KEYS = DEFAULT_SHORTCUTS.map((_, index) => `Link${index + 1}`);

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

chrome.runtime.onInstalled.addListener(() => {
  const keys = Object.keys(DEFAULT_SETTINGS);
  chrome.storage.sync.get(keys, storedSettings => {
    const updates = {};

    keys.forEach(key => {
      if (key === 'Shortcuts') return;
      if (storedSettings[key] === undefined) {
        updates[key] = DEFAULT_SETTINGS[key];
      } else if (SHORTCUT_NAME_MIGRATIONS[storedSettings[key]]) {
        updates[key] = SHORTCUT_NAME_MIGRATIONS[storedSettings[key]];
      }
    });

    const storedShortcuts = Array.isArray(storedSettings.Shortcuts)
      ? storedSettings.Shortcuts
      : LEGACY_LINK_KEYS.map(key => storedSettings[key]);
    const normalizedShortcuts = storedShortcuts
      .map(name => SHORTCUT_NAME_MIGRATIONS[name] || name)
      .filter(name => typeof name === 'string' && name.length > 0);

    for (const fallback of DEFAULT_SHORTCUTS) {
      if (normalizedShortcuts.length >= MIN_SHORTCUTS) break;
      if (!normalizedShortcuts.includes(fallback)) normalizedShortcuts.push(fallback);
    }

    if (!arraysEqual(storedSettings.Shortcuts, normalizedShortcuts)) {
      updates.Shortcuts = normalizedShortcuts.length > 0
        ? normalizedShortcuts
        : [...DEFAULT_SHORTCUTS];
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.sync.set(updates);
    }
  });
});

function arraysEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}
