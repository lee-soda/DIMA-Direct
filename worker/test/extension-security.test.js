import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectRoot = new URL('../../', import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, projectRoot), 'utf8'));
}

test('확장 내부 JSON은 일반 웹페이지에 공개하지 않는다', async () => {
  const manifest = await readJson('manifest.json');
  assert.equal('web_accessible_resources' in manifest, false);
});

test('외부 바로가기는 HTTPS만 사용하고 폐기된 사이트맵을 노출하지 않는다', async () => {
  const pageData = await readJson('data/page.json');
  assert.equal(pageData['사이트맵'], undefined);

  for (const [name, item] of Object.entries(pageData)) {
    if (!/^[a-z][a-z\d+.-]*:/i.test(item.URL)) continue;
    assert.match(item.URL, /^https:\/\//i, `${name} 바로가기는 HTTPS여야 합니다.`);
  }
});

test('팝업 바로가기는 키보드 사용이 가능한 네이티브 링크다', async () => {
  const source = await readFile(new URL('js/popup.js', projectRoot), 'utf8');
  assert.match(source, /document\.createElement\(['"]a['"]\)/);
  assert.match(source, /element\.rel\s*=\s*['"]noopener noreferrer['"]/);
  assert.doesNotMatch(source, /element\.addEventListener\(['"]click['"]/);
});
