// concurrencyCap.test.ts — Story 17.2
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { canPromoteToActive } from './concurrencyCap.ts'
import { dropsDb } from '../db/drops.ts'
import { _seedCustomerTier, _clearCustomerTier } from '../services/customerTier.ts'

beforeEach(() => {
  dropsDb._reset()
  _clearCustomerTier()
})

describe('canPromoteToActive — concurrency caps', () => {
  it('Solo with 1 active returns allowed=false', async () => {
    _seedCustomerTier('cust-solo', 'solo')

    // Create a drop and set it to ACTIVE manually
    const drop = dropsDb.create({
      customerId: 'cust-solo',
      country: 'US',
      sku: 'SKU-001',
      sizes: ['10'],
      maxAccounts: 1,
      paymentMethodId: 'pm_test',
      scheduledAt: new Date().toISOString(),
    })
    dropsDb.updateState(drop.id, 'cust-solo', ['DRAFT'], 'SCHEDULED')
    dropsDb.updateState(drop.id, 'cust-solo', ['SCHEDULED'], 'ARMED')
    dropsDb.updateState(drop.id, 'cust-solo', ['ARMED'], 'ACTIVE')

    const result = await canPromoteToActive('cust-solo')
    assert.equal(result.allowed, false)
    assert.equal(result.current, 1)
    assert.equal(result.max, 1)
  })

  it('Solo with 0 active returns allowed=true', async () => {
    _seedCustomerTier('cust-solo-empty', 'solo')
    const result = await canPromoteToActive('cust-solo-empty')
    assert.equal(result.allowed, true)
    assert.equal(result.current, 0)
    assert.equal(result.max, 1)
  })

  it('Pro with 4 active returns allowed=true', async () => {
    _seedCustomerTier('cust-pro', 'pro')

    for (let i = 0; i < 4; i++) {
      const drop = dropsDb.create({
        customerId: 'cust-pro',
        country: 'US',
        sku: `SKU-${i}`,
        sizes: ['10'],
        maxAccounts: 1,
        paymentMethodId: 'pm_test',
        scheduledAt: new Date().toISOString(),
      })
      dropsDb.updateState(drop.id, 'cust-pro', ['DRAFT'], 'SCHEDULED')
      dropsDb.updateState(drop.id, 'cust-pro', ['SCHEDULED'], 'ARMED')
      dropsDb.updateState(drop.id, 'cust-pro', ['ARMED'], 'ACTIVE')
    }

    const result = await canPromoteToActive('cust-pro')
    assert.equal(result.allowed, true)
    assert.equal(result.current, 4)
    assert.equal(result.max, 5)
  })

  it('Pro with 5 active returns allowed=false', async () => {
    _seedCustomerTier('cust-pro-full', 'pro')

    for (let i = 0; i < 5; i++) {
      const drop = dropsDb.create({
        customerId: 'cust-pro-full',
        country: 'US',
        sku: `SKU-${i}`,
        sizes: ['10'],
        maxAccounts: 1,
        paymentMethodId: 'pm_test',
        scheduledAt: new Date().toISOString(),
      })
      dropsDb.updateState(drop.id, 'cust-pro-full', ['DRAFT'], 'SCHEDULED')
      dropsDb.updateState(drop.id, 'cust-pro-full', ['SCHEDULED'], 'ARMED')
      dropsDb.updateState(drop.id, 'cust-pro-full', ['ARMED'], 'ACTIVE')
    }

    const result = await canPromoteToActive('cust-pro-full')
    assert.equal(result.allowed, false)
    assert.equal(result.current, 5)
    assert.equal(result.max, 5)
  })

  it('Enterprise always returns allowed=true regardless of active count', async () => {
    _seedCustomerTier('cust-ent', 'enterprise')

    for (let i = 0; i < 10; i++) {
      const drop = dropsDb.create({
        customerId: 'cust-ent',
        country: 'US',
        sku: `SKU-${i}`,
        sizes: ['10'],
        maxAccounts: 1,
        paymentMethodId: 'pm_test',
        scheduledAt: new Date().toISOString(),
      })
      dropsDb.updateState(drop.id, 'cust-ent', ['DRAFT'], 'SCHEDULED')
      dropsDb.updateState(drop.id, 'cust-ent', ['SCHEDULED'], 'ARMED')
      dropsDb.updateState(drop.id, 'cust-ent', ['ARMED'], 'ACTIVE')
    }

    const result = await canPromoteToActive('cust-ent')
    assert.equal(result.allowed, true)
    assert.equal(result.current, 10)
    assert.equal(result.max, null)
  })
})
