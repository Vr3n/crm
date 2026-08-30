import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../helpers/db'
import { getDb } from '../../src/main/db/connection'
import { seedPermissions, seedRolesForOrganization, SEED_ROLES } from '../../src/main/db/seed'
import { ALL_PERMISSION_CODES } from '../../src/main/db/permissions'
import { organizationRepo, roleRepo } from '../../src/main/repositories/identity'

setupTestDb()

describe('seedPermissions', () => {
  it('inserts the full catalog', () => {
    const count = (
      getDb().prepare('SELECT COUNT(*) AS n FROM permissions').get() as {
        n: number
      }
    ).n
    expect(count).toBe(ALL_PERMISSION_CODES.length)
  })

  it('is idempotent — running twice does not duplicate codes', () => {
    seedPermissions()
    seedPermissions()
    const count = (
      getDb().prepare('SELECT COUNT(*) AS n FROM permissions').get() as {
        n: number
      }
    ).n
    expect(count).toBe(ALL_PERMISSION_CODES.length)
  })
})

describe('seedRolesForOrganization', () => {
  function seedOrg(): number {
    const org = organizationRepo.create({
      slug: 'test-gym',
      name: 'Test Gym',
      mobileNumber: '9876543210',
      currency: 'INR'
    })
    seedRolesForOrganization(org.id)
    return org.id
  }

  it('creates every starter role', () => {
    const orgId = seedOrg()
    const roles = getDb()
      .prepare('SELECT name FROM roles WHERE organization_id = ?')
      .all(orgId) as { name: string }[]
    expect(roles.map((r) => r.name).sort()).toEqual(SEED_ROLES.map((r) => r.name).sort())
  })

  it('marks Owner and Admin as system + super', () => {
    const orgId = seedOrg()
    const system = getDb()
      .prepare(
        'SELECT name, is_system_role, is_super FROM roles WHERE organization_id = ? AND is_system_role = 1'
      )
      .all(orgId) as { name: string; is_system_role: number; is_super: number }[]
    expect(system.map((r) => r.name).sort()).toEqual(['Admin', 'Owner'])
    for (const role of system) {
      expect(role.is_super).toBe(1)
    }
  })

  it('keeps other roles non-system and non-super', () => {
    const orgId = seedOrg()
    const others = getDb()
      .prepare(
        'SELECT name, is_system_role, is_super FROM roles WHERE organization_id = ? AND is_system_role = 0'
      )
      .all(orgId) as { name: string; is_system_role: number; is_super: number }[]
    expect(others.length).toBeGreaterThan(0)
    for (const role of others) {
      expect(role.is_super).toBe(0)
    }
  })

  it('returns all catalog permissions for a super role', () => {
    const orgId = seedOrg()
    const owner = getDb()
      .prepare("SELECT id FROM roles WHERE organization_id = ? AND name = 'Owner'")
      .get(orgId) as { id: number }
    expect(roleRepo.findPermissionCodes(owner.id).sort()).toEqual([...ALL_PERMISSION_CODES].sort())
  })

  it('grants a non-super role exactly its configured permissions', () => {
    const orgId = seedOrg()
    const manager = getDb()
      .prepare("SELECT id FROM roles WHERE organization_id = ? AND name = 'Manager'")
      .get(orgId) as { id: number }
    const expected = SEED_ROLES.find((r) => r.name === 'Manager')!.permissions
    expect(roleRepo.findPermissionCodes(manager.id).sort()).toEqual([...expected].sort())
  })
})
