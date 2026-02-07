import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeModelsOverview,
  redactSecrets,
  sanitizeProviderUpsertInput,
} from '../../skills/dzzenos/api/openclaw-gateway.ts';

test('sanitizeProviderUpsertInput validates required fields', () => {
  assert.throws(() => sanitizeProviderUpsertInput({}), /id is required/i);
  assert.throws(() => sanitizeProviderUpsertInput({ id: 'x' }), /kind is required/i);

  const payload = sanitizeProviderUpsertInput({
    id: 'openai-main',
    kind: 'openai',
    auth_mode: 'api_key',
    api_key: 'secret',
    enabled: false,
  });

  assert.equal(payload.id, 'openai-main');
  assert.equal(payload.kind, 'openai');
  assert.equal(payload.auth_mode, 'api_key');
  assert.equal(payload.enabled, false);
  assert.equal(payload.api_key, 'secret');
});

test('redactSecrets masks sensitive keys recursively', () => {
  const redacted = redactSecrets({
    api_key: 'abc',
    token: 'xyz',
    nested: {
      password: 'p',
      keep: 'ok',
    },
  });

  assert.equal((redacted as any).api_key, '***');
  assert.equal((redacted as any).token, '***');
  assert.equal((redacted as any).nested.password, '***');
  assert.equal((redacted as any).nested.keep, 'ok');
});

test('normalizeModelsOverview converts provider/model maps', () => {
  const overview = normalizeModelsOverview({
    providers: {
      openai_main: {
        kind: 'openai',
        auth_mode: 'api_key',
        auth_state: 'connected',
        enabled: true,
      },
    },
    models: {
      'gpt-4o': {
        provider_id: 'openai_main',
        display_name: 'GPT-4o',
        availability: 'ready',
      },
    },
  });

  assert.equal(overview.providers.length, 1);
  assert.equal(overview.providers[0].id, 'openai_main');
  assert.equal(overview.providers[0].kind, 'openai');
  assert.equal(overview.providers[0].auth_state, 'connected');

  assert.equal(overview.models.length, 1);
  assert.equal(overview.models[0].id, 'gpt-4o');
  assert.equal(overview.models[0].provider_id, 'openai_main');
  assert.equal(overview.models[0].availability, 'ready');
});
