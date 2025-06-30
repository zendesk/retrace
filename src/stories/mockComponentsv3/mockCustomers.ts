export interface Customer {
  id: string
  name: string
  email: string
  company: string
  avatar: string
  joined: string
  notes: string
  ticketCount: number
  status: 'active' | 'inactive' | 'vip'
}

// Map ticket IDs to customer names for consistency
const ticketToCustomerMap: Record<number, string> = {
  1: 'John Doe',
  2: 'Jane Smith',
  3: 'Tom Hanks',
  4: 'Bruce Wayne',
  5: 'Clark Kent',
  6: 'Diana Prince',
  7: 'Peter Parker',
  8: 'Tony Stark',
}

export const mockCustomers: Record<string, Customer> = {
  'John Doe': {
    id: 'cust_001',
    name: 'John Doe',
    email: 'john.doe@example.com',
    company: 'Doe Enterprises',
    avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
    joined: '2022-03-15',
    notes: 'Frequent issues with hardware setups. Cat owner.',
    ticketCount: 12,
    status: 'active',
  },
  'Jane Smith': {
    id: 'cust_002',
    name: 'Jane Smith',
    email: 'jane.smith@techcorp.com',
    company: 'TechCorp Industries',
    avatar: 'https://randomuser.me/api/portraits/women/1.jpg',
    joined: '2023-01-22',
    notes: 'Coffee enthusiast, prone to spills. Handle with care.',
    ticketCount: 8,
    status: 'active',
  },
  'Tom Hanks': {
    id: 'cust_003',
    name: 'Tom Hanks',
    email: 'tom.hanks@hollywood.com',
    company: 'Hollywood Studios',
    avatar: 'https://randomuser.me/api/portraits/men/2.jpg',
    joined: '2023-06-10',
    notes: 'VIP customer. Printer has mysterious issues.',
    ticketCount: 5,
    status: 'vip',
  },
  'Bruce Wayne': {
    id: 'cust_004',
    name: 'Bruce Wayne',
    email: 'bruce.wayne@waynecorp.com',
    company: 'Wayne Corporation',
    avatar: 'https://randomuser.me/api/portraits/men/3.jpg',
    joined: '2021-11-08',
    notes: 'Night owl. Equipment makes unusual sounds.',
    ticketCount: 15,
    status: 'vip',
  },
  'Clark Kent': {
    id: 'cust_005',
    name: 'Clark Kent',
    email: 'clark.kent@dailyplanet.com',
    company: 'Daily Planet',
    avatar: 'https://randomuser.me/api/portraits/men/4.jpg',
    joined: '2022-08-03',
    notes: 'Journalist. Screen display issues with videos.',
    ticketCount: 7,
    status: 'active',
  },
  'Diana Prince': {
    id: 'cust_006',
    name: 'Diana Prince',
    email: 'diana.prince@museum.org',
    company: 'Metropolitan Museum',
    avatar: 'https://randomuser.me/api/portraits/women/2.jpg',
    joined: '2023-02-14',
    notes: 'Museum curator. Network connectivity issues.',
    ticketCount: 4,
    status: 'active',
  },
  'Peter Parker': {
    id: 'cust_007',
    name: 'Peter Parker',
    email: 'peter.parker@bugle.com',
    company: 'Daily Bugle',
    avatar: 'https://randomuser.me/api/portraits/men/5.jpg',
    joined: '2023-09-01',
    notes: 'Young photographer. Hardware behaves strangely.',
    ticketCount: 9,
    status: 'active',
  },
  'Tony Stark': {
    id: 'cust_008',
    name: 'Tony Stark',
    email: 'tony.stark@starkindustries.com',
    company: 'Stark Industries',
    avatar: 'https://randomuser.me/api/portraits/men/6.jpg',
    joined: '2021-05-15',
    notes: 'Tech innovator. Auto-correct issues with emails.',
    ticketCount: 22,
    status: 'vip',
  },
}

export const getCustomerByTicketId = (
  ticketId: number,
): Customer | undefined => {
  const customerName = ticketToCustomerMap[ticketId]
  return customerName ? mockCustomers[customerName] : undefined
}
