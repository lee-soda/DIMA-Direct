import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerUrl = new URL(process.argv[2] || '');
const validHost = workerUrl.hostname.endsWith('.workers.dev');
const validPath = workerUrl.pathname === '/v1/bus-arrivals';
const hasNoExtras = !workerUrl.search && !workerUrl.hash && !workerUrl.username && !workerUrl.password && !workerUrl.port;

if (workerUrl.protocol !== 'https:' || !validHost || !validPath || !hasNoExtras) {
  throw new Error('https://<worker>.<subdomain>.workers.dev/v1/bus-arrivals 형식의 URL이 필요합니다.');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(scriptDirectory, '..', '..');
const busPath = path.join(extensionRoot, 'data', 'bus.json');
const manifestPath = path.join(extensionRoot, 'manifest.json');

const busData = JSON.parse(fs.readFileSync(busPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

busData.intercityRealtime.endpoint = workerUrl.toString();
manifest.host_permissions = [`${workerUrl.origin}/*`];

fs.writeFileSync(busPath, `${JSON.stringify(busData, null, 2)}\n`, 'utf8');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`확장 프로그램 Worker 주소 설정 완료: ${workerUrl.origin}`);
