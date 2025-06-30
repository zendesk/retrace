import { useEffect, useState } from 'react'
import * as React from 'react'
import styled from 'styled-components'
import { Avatar } from '@zendeskgarden/react-avatars'
import { Skeleton } from '@zendeskgarden/react-loaders'
import { Alert, Well } from '@zendeskgarden/react-notifications'
import { DEFAULT_THEME, PALETTE } from '@zendeskgarden/react-theming'
import { LG, MD, SM, Span } from '@zendeskgarden/react-typography'
import { ReactComponent as BuildingIcon } from '@zendeskgarden/svg-icons/src/16/building-stroke.svg'
import { ReactComponent as CalendarIcon } from '@zendeskgarden/svg-icons/src/16/calendar-stroke.svg'
import { ReactComponent as EmailIcon } from '@zendeskgarden/svg-icons/src/16/email-stroke.svg'
import { ReactComponent as NoteIcon } from '@zendeskgarden/svg-icons/src/16/notes-stroke.svg'
import { ReactComponent as UserIcon } from '@zendeskgarden/svg-icons/src/16/user-solo-stroke.svg'
import { type Customer, getCustomerByTicketId } from './mockCustomers'
import { triggerLongTasks } from './simulateLongTasks'
import { useBeacon } from './traceManager'

const SidebarContainer = styled(Well)`
  width: 320px;
  height: fit-content;
  margin-left: ${DEFAULT_THEME.space.base * 4}px;
  padding: ${DEFAULT_THEME.space.base * 4}px;
`

const CustomerSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: ${DEFAULT_THEME.space.base * 4}px;
`

const CustomerInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${DEFAULT_THEME.space.base * 2}px;
  width: 100%;
`

const InfoRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${DEFAULT_THEME.space.base * 2}px;
  padding: ${DEFAULT_THEME.space.base * 2}px;
  background-color: ${PALETTE.grey[100]};
  border-radius: ${DEFAULT_THEME.borderRadii.md};
`

const StatusBadge = styled(Span)<{ status: Customer['status'] }>`
  padding: ${DEFAULT_THEME.space.base}px ${DEFAULT_THEME.space.base * 2}px;
  border-radius: ${DEFAULT_THEME.borderRadii.sm};
  font-size: ${DEFAULT_THEME.fontSizes.xs};
  font-weight: ${DEFAULT_THEME.fontWeights.semibold};
  text-transform: uppercase;
  color: ${(props) => {
    switch (props.status) {
      case 'vip':
        return PALETTE.purple[700]
      case 'active':
        return PALETTE.green[700]
      case 'inactive':
        return PALETTE.grey[600]
      default:
        return PALETTE.grey[600]
    }
  }};
  background-color: ${(props) => {
    switch (props.status) {
      case 'vip':
        return PALETTE.purple[100]
      case 'active':
        return PALETTE.green[100]
      case 'inactive':
        return PALETTE.grey[200]
      default:
        return PALETTE.grey[200]
    }
  }};
`

const NotesSection = styled.div`
  margin-top: ${DEFAULT_THEME.space.base * 3}px;
  padding: ${DEFAULT_THEME.space.base * 3}px;
  background-color: ${PALETTE.blue[100]};
  border-radius: ${DEFAULT_THEME.borderRadii.md};
  border-left: 4px solid ${PALETTE.blue[600]};
`

interface CustomerSidebarProps {
  ticketId: number
}

export const CustomerSidebar: React.FC<CustomerSidebarProps> = ({
  ticketId,
}) => {
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Use beacon for tracing
  useBeacon({
    name: 'CustomerSidebar',
    relatedTo: { ticketId },
    renderedOutput: isLoading ? 'loading' : customer ? 'content' : 'error',
    isIdle: !isLoading,
    error: error ? new Error(error) : undefined,
    attributes: {
      customerId: customer?.id,
      customerStatus: customer?.status,
    },
  })

  useEffect(() => {
    const loadCustomerData = async () => {
      setIsLoading(true)
      setError(null)

      // Simulate network request with timing similar to the provided example
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_800 + Math.random() * 400)
      })

      // Simulate some CPU work
      triggerLongTasks({
        minTime: 20,
        maxTime: 50,
        totalClusterDuration: 100,
      })

      try {
        const customerData = getCustomerByTicketId(ticketId)

        if (!customerData) {
          setError('Customer not found')
          setCustomer(null)
        } else {
          setCustomer(customerData)
        }
      } catch {
        setError('Failed to load customer data')
        setCustomer(null)
      } finally {
        setIsLoading(false)
      }
    }

    void loadCustomerData()
  }, [ticketId])

  if (isLoading) {
    return (
      <SidebarContainer>
        <LG isBold style={{ marginBottom: DEFAULT_THEME.space.base * 4 }}>
          Customer Context
        </LG>
        <CustomerSection>
          <Skeleton
            height="64px"
            width="64px"
            style={{ borderRadius: '50%' }}
          />
          <Skeleton
            height="20px"
            width="140px"
            style={{ marginTop: DEFAULT_THEME.space.base * 2 }}
          />
          <Skeleton height="16px" width="180px" />
        </CustomerSection>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: DEFAULT_THEME.space.base * 2,
          }}
        >
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="40px" />
          <Skeleton height="60px" />
        </div>
      </SidebarContainer>
    )
  }

  if (error || !customer) {
    return (
      <SidebarContainer>
        <LG isBold style={{ marginBottom: DEFAULT_THEME.space.base * 4 }}>
          Customer Context
        </LG>
        <Alert type="error">
          <Alert.Title>Unable to load customer data</Alert.Title>
          {error ?? 'Customer information not available for this ticket.'}
        </Alert>
      </SidebarContainer>
    )
  }

  return (
    <SidebarContainer>
      <LG isBold style={{ marginBottom: DEFAULT_THEME.space.base * 4 }}>
        Customer Context
      </LG>

      <CustomerSection>
        <Avatar size="large" backgroundColor={PALETTE.grey[600]}>
          <img
            alt={customer.name}
            src={customer.avatar}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => {
              // Fallback to icon if image fails to load
              e.currentTarget.style.display = 'none'
              e.currentTarget.parentElement!.innerHTML = `
                <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM8 9a5 5 0 00-5 5h10a5 5 0 00-5-5z"/>
                </svg>
              `
            }}
          />
        </Avatar>
        <MD isBold style={{ marginTop: DEFAULT_THEME.space.base * 2 }}>
          {customer.name}
        </MD>
        <StatusBadge status={customer.status}>{customer.status}</StatusBadge>
      </CustomerSection>

      <CustomerInfo>
        <InfoRow>
          <EmailIcon style={{ color: PALETTE.grey[600], flexShrink: 0 }} />
          <div>
            <SM isBold style={{ color: PALETTE.grey[600], display: 'block' }}>
              Email
            </SM>
            <Span>{customer.email}</Span>
          </div>
        </InfoRow>

        <InfoRow>
          <BuildingIcon style={{ color: PALETTE.grey[600], flexShrink: 0 }} />
          <div>
            <SM isBold style={{ color: PALETTE.grey[600], display: 'block' }}>
              Company
            </SM>
            <Span>{customer.company}</Span>
          </div>
        </InfoRow>

        <InfoRow>
          <CalendarIcon style={{ color: PALETTE.grey[600], flexShrink: 0 }} />
          <div>
            <SM isBold style={{ color: PALETTE.grey[600], display: 'block' }}>
              Customer Since
            </SM>
            <Span>{customer.joined}</Span>
          </div>
        </InfoRow>

        <InfoRow>
          <UserIcon style={{ color: PALETTE.grey[600], flexShrink: 0 }} />
          <div>
            <SM isBold style={{ color: PALETTE.grey[600], display: 'block' }}>
              Total Tickets
            </SM>
            <Span>{customer.ticketCount}</Span>
          </div>
        </InfoRow>
      </CustomerInfo>

      <NotesSection>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: DEFAULT_THEME.space.base,
            marginBottom: DEFAULT_THEME.space.base * 2,
          }}
        >
          <NoteIcon style={{ color: PALETTE.blue[600] }} />
          <SM isBold style={{ color: PALETTE.blue[700] }}>
            AGENT NOTES
          </SM>
        </div>
        <Span style={{ color: PALETTE.blue[800] }}>{customer.notes}</Span>
      </NotesSection>
    </SidebarContainer>
  )
}
