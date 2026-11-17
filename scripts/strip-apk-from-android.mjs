import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('android/app/src/main/assets/public/apk');
if (existsSync(target)) {
  rmSync(target, { recursive: true, force: true });
  console.log('Removed /apk from Android web assets so the installed APK does not bundle itself.');
} else {
  console.log('No /apk directory inside Android web assets — nothing to strip.');
}
