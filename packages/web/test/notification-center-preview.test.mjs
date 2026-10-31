import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the drawer keeps chrome at intrinsic height and gives only the timeline remaining space', () => {
  const css = source('../src/components/hub/notification-center-preview.module.css');
  const center = source('../src/components/hub/notification-center-preview.tsx');
  assert.match(css, /\.drawer\s*\{\s*display: flex;\s*flex-direction: column;/);
  assert.match(css, /\.drawer > \*\s*\{\s*flex-shrink: 0;/);
  assert.match(center, /min-h-0 flex-1 overflow-y-scroll/);
});

test('only the notification drawer overrides the overlay with a lighter 2px blur', () => {
  const center = source('../src/components/hub/notification-center-preview.tsx');
  const dialog = source('../src/components/ui/dialog.tsx');
  assert.match(center, /overlayClassName="bg-background\/40 backdrop-blur-\[2px\]"/);
  assert.match(dialog, /<DialogOverlay className=\{overlayClassName\} \/>/);
  assert.match(dialog, /bg-background\/85 backdrop-blur-md/);
});

test('preview uses the existing financial privacy context and never renders the raw amount directly', () => {
  const center = source('../src/components/hub/notification-center-preview.tsx');
  assert.match(center, /const \{ isPrivate \} = usePrivacy\(\)/);
  assert.match(center, /\{isPrivate \? '\*\*\*\*' : notification\.amount\}/);
  assert.doesNotMatch(center, /\{notification\.amount\}/);
  assert.match(center, /dados fictícios, sem sincronização/);
});

test('the shell uses the real production center and preserves an explicit notification callback', () => {
  const shell = source('../src/components/hub/hub-shell.tsx');
  assert.doesNotMatch(
    shell,
    /NotificationCenterPreview|previewUnreadCount|showNotificationPreview/,
  );
  assert.match(shell, /onOpenNotifications=\{\s*onOpenNotifications\s*\?\?/);
  assert.match(shell, /<NotificationCenter\s/);
});
