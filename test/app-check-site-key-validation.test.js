import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeAppCheckSiteKey } from '../src/services/dataCenter.js'

test('accepts an opaque site key without requiring a fixed prefix or character set', () => {
  const opaqueKey = 'example.enterprise-key+v1/segment='
  assert.equal(normalizeAppCheckSiteKey(opaqueKey), opaqueKey)
})

test('keeps compatibility with the previously accepted key shape', () => {
  const legacyShape = 'AbCdEf0123456789_-example'
  assert.equal(normalizeAppCheckSiteKey(legacyShape), legacyShape)
})

test('trims leading and trailing whitespace and line breaks', () => {
  const opaqueKey = 'example.enterprise-key+v1/segment='
  assert.equal(normalizeAppCheckSiteKey(` \r\n${opaqueKey}\n `), opaqueKey)
})

test('allows an empty value because App Check configuration is optional', () => {
  assert.equal(normalizeAppCheckSiteKey(' \n '), '')
})

test('rejects script, HTML, and JavaScript snippets without echoing their contents', () => {
  const invalidValues = [
    '<script src="https://example.invalid/api.js"></script>',
    '<div>example-key</div>',
    'javascript:example()',
    'const siteKey = exampleValue',
    'new ReCaptchaEnterpriseProvider(exampleValue)'
  ]

  for (const invalidValue of invalidValues) {
    assert.throws(
      () => normalizeAppCheckSiteKey(invalidValue),
      error => !error.message.includes(invalidValue)
    )
  }
})

test('rejects internal whitespace, control characters, and unreasonable length', () => {
  assert.throws(() => normalizeAppCheckSiteKey('example key'))
  assert.throws(() => normalizeAppCheckSiteKey('example\nkey'))
  assert.throws(() => normalizeAppCheckSiteKey('x'.repeat(2049)))
})
