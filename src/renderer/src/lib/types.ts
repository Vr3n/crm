export interface DashboardStats {
  totalMembers: number
  activeMembers: number
  monthlyRevenue: number
  checkinsToday: number
}

export interface Member {
  id: number
  name: string
  email: string
  plan: string
  planPrice: number
  status: string
  joinedAt: string
}

export interface DashboardData {
  stats: DashboardStats
  recentMembers: Member[]
}
