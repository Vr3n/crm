import type { OrganizationProfile, Role, StaffMember } from './types'

/**
 * Module 14/15 seed data — the FitZone Aurangabad tenant from the docs'
 * worked example: one organization, the six starter roles (Owner/Admin super),
 * and the exact staff cast (Neha Sales, Arjun Front Desk, Kavita Finance, plus
 * the Owner account). Timestamps are relative so the demo always looks alive.
 */

const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString()

export const SEED_ORGANIZATION: OrganizationProfile = {
  id: 1,
  slug: 'fitzone-aurangabad',
  name: 'FitZone Aurangabad',
  legalName: 'FitZone Fitness LLP',
  billingEmail: 'billing@fitzone.in',
  mobileNumber: '9823456710',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  status: 'ACTIVE',
  planTier: null,
  createdAt: daysAgo(400)
}

export const SEED_ROLES: Role[] = [
  {
    id: 'role-owner',
    name: 'Owner',
    description:
      'The organization\u2019s root account. Cannot be removed or demoted; manages Admins and org settings.',
    isSystemRole: true,
    isSuper: true,
    permissionCodes: []
  },
  {
    id: 'role-admin',
    name: 'Admin',
    description:
      'Super access for daily operation: users, roles and org settings. Can be demoted or removed by the Owner.',
    isSystemRole: true,
    isSuper: true,
    permissionCodes: []
  },
  {
    id: 'role-manager',
    name: 'Manager',
    description:
      'Full access to Sales, Membership, Billing, Finance and Reporting. No org settings, no user management.',
    isSystemRole: false,
    isSuper: false,
    permissionCodes: [
      'org.view',
      'user.view',
      'role.view',
      'lead.view',
      'lead.create',
      'followup.create',
      'followup.complete',
      'membership.sell',
      'invoice.view',
      'invoice.finalize',
      'payment.record',
      'finance.dashboard.view'
    ]
  },
  {
    id: 'role-sales',
    name: 'Sales',
    description: 'Leads, follow-ups, activities and membership sale/conversion.',
    isSystemRole: false,
    isSuper: false,
    permissionCodes: [
      'lead.create',
      'lead.view',
      'lead.update_stage',
      'lead.record_activity',
      'followup.create',
      'followup.complete',
      'membership.sell'
    ]
  },
  {
    id: 'role-front-desk',
    name: 'Front Desk',
    description: 'Leads (view/activity/follow-up only), customer lookup, check-in. No billing.',
    isSystemRole: false,
    isSuper: false,
    permissionCodes: [
      'lead.view',
      'lead.record_activity',
      'followup.create',
      'followup.complete',
      'customer.view'
    ]
  },
  {
    id: 'role-finance',
    name: 'Finance',
    description:
      'Invoices, payments, refunds, credits and finance dashboards. No lead pipeline access.',
    isSystemRole: false,
    isSuper: false,
    permissionCodes: [
      'user.view',
      'invoice.view',
      'invoice.finalize',
      'payment.record',
      'payment.allocate',
      'refund.create',
      'credit.create',
      'finance.dashboard.view'
    ]
  }
]

export const SEED_STAFF: StaffMember[] = [
  {
    id: 'staff-owner',
    userId: 103,
    fullName: 'Aarav Mehta',
    email: 'owner@fitzone.com',
    roleId: 'role-owner',
    roleName: 'Owner',
    isSuper: true,
    isSystemRole: true,
    status: 'ACTIVE',
    joinedAt: daysAgo(400)
  },
  {
    id: 'staff-admin',
    userId: 104,
    fullName: 'Sanya Gupta',
    email: 'sanya@fitzone.com',
    roleId: 'role-admin',
    roleName: 'Admin',
    isSuper: true,
    isSystemRole: true,
    status: 'ACTIVE',
    joinedAt: daysAgo(360)
  },
  {
    id: 'staff-manager',
    userId: 105,
    fullName: 'Vikram Singh',
    email: 'vikram@fitzone.com',
    roleId: 'role-manager',
    roleName: 'Manager',
    isSuper: false,
    isSystemRole: false,
    status: 'ACTIVE',
    joinedAt: daysAgo(210)
  },
  {
    id: 'staff-neha',
    userId: 100,
    fullName: 'Neha Sharma',
    email: 'neha@example.com',
    roleId: 'role-sales',
    roleName: 'Sales',
    isSuper: false,
    isSystemRole: false,
    status: 'ACTIVE',
    joinedAt: daysAgo(150)
  },
  {
    id: 'staff-arjun',
    userId: 101,
    fullName: 'Arjun Nair',
    email: 'arjun@example.com',
    roleId: 'role-front-desk',
    roleName: 'Front Desk',
    isSuper: false,
    isSystemRole: false,
    status: 'ACTIVE',
    joinedAt: daysAgo(96)
  },
  {
    id: 'staff-kavita',
    userId: 102,
    fullName: 'Kavita Rao',
    email: 'kavita@example.com',
    roleId: 'role-finance',
    roleName: 'Finance',
    isSuper: false,
    isSystemRole: false,
    status: 'ACTIVE',
    joinedAt: daysAgo(64)
  },
  {
    id: 'staff-rohit',
    userId: 106,
    fullName: 'Rohit Verma',
    email: 'rohit@fitzone.com',
    roleId: 'role-front-desk',
    roleName: 'Front Desk',
    isSuper: false,
    isSystemRole: false,
    status: 'INVITED',
    joinedAt: daysAgo(3)
  },
  {
    id: 'staff-meera',
    userId: 107,
    fullName: 'Meera Iyer',
    email: 'meera@fitzone.com',
    roleId: 'role-finance',
    roleName: 'Finance',
    isSuper: false,
    isSystemRole: false,
    status: 'DISABLED',
    joinedAt: daysAgo(190)
  }
]
