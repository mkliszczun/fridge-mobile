import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraPermissionState, handleCameraPermissionAction } from '../utils/cameraPermission.js';

test('loading and granted states do not ask for permission', async () => {
  assert.equal(cameraPermissionState(null), 'loading');
  assert.equal(cameraPermissionState({ granted: true, canAskAgain: false }), 'granted');
  await handleCameraPermissionAction(null, {});
  await handleCameraPermissionAction({ granted: true }, {});
});

test('ordinary refusal allows another explicit request', async () => {
  let requests = 0;
  const permission = { status: 'denied', granted: false, canAskAgain: true };
  assert.equal(cameraPermissionState(permission), 'request');
  await handleCameraPermissionAction(permission, { requestPermission: async () => requests++ });
  assert.equal(requests, 1);
});

test('permanent refusal opens system settings without asking again on iOS and Android', async () => {
  for (const platform of ['ios', 'android']) {
    let settings = 0;
    const permission = { status: 'denied', granted: false, canAskAgain: false };
    assert.equal(cameraPermissionState(permission, platform), 'settings');
    await handleCameraPermissionAction(permission, { openSettings: async () => settings++ }, platform);
    assert.equal(settings, 1);
  }
});

test('after returning from settings a newly granted permission unlocks the scanner', () => {
  assert.equal(cameraPermissionState({ granted: false, canAskAgain: false }), 'settings');
  assert.equal(cameraPermissionState({ granted: true, canAskAgain: true }), 'granted');
});

test('web refusal refreshes permission instead of opening unsupported system settings', async () => {
  let refreshes = 0;
  await handleCameraPermissionAction({ status: 'denied', granted: false, canAskAgain: true }, {
    refreshPermission: async () => refreshes++,
  }, 'web');
  assert.equal(refreshes, 1);
});

test('settings failure is surfaced to the screen for a manual-settings instruction', async () => {
  await assert.rejects(handleCameraPermissionAction({ granted: false, canAskAgain: false }, {
    openSettings: async () => { throw new Error('unavailable'); },
  }), /unavailable/);
});
