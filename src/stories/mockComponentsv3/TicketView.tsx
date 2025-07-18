import { useEffect, useState } from 'react'
import * as React from 'react'
import styled from 'styled-components'
import { Timeline } from '@zendeskgarden/react-accordions'
import { Avatar } from '@zendeskgarden/react-avatars'
import { Skeleton } from '@zendeskgarden/react-loaders'
import { Well } from '@zendeskgarden/react-notifications'
import { DEFAULT_THEME, PALETTE } from '@zendeskgarden/react-theming'
import { Paragraph, Span, XXL } from '@zendeskgarden/react-typography'
import { ReactComponent as UserIcon } from '@zendeskgarden/svg-icons/src/16/user-solo-stroke.svg'
import { CustomerSidebar } from './CustomerSidebar'
import { customerSidebarTracer } from './customerSidebarTracer'
import { TimingComponent } from './element'
import { mockTickets } from './mockTickets'
import { triggerLongTasks } from './simulateLongTasks'
import { useBeacon } from './traceManager'

const TicketViewContainer = styled.div`
  display: flex;
  gap: ${DEFAULT_THEME.space.base * 4}px;
  width: 100%;
`

const TicketContent = styled.div`
  flex: 1;
  min-width: 0; /* Prevents flex child from overflowing */
`

export const StyledSpan = styled(Span).attrs({ isBold: true, hue: 'blue' })`
  margin-left: ${DEFAULT_THEME.space.base * 2}px;
`
export const MessageSpan = styled(Span).attrs({})`
  display: block;
`
const TimelineContentWide = styled(Timeline.Content)`
  flex: 5;
`

interface TicketViewProps {
  ticketId: number
  cached?: boolean
  onLoaded?: () => void
}

export const TicketView: React.FC<TicketViewProps> = ({
  ticketId,
  cached = false,
  onLoaded,
}) => {
  const [stateX, setStateX] = useState(0)

  useBeacon({
    name: 'TicketView',
    relatedTo: { ticketId },
    renderedOutput: cached ? 'content' : 'loading',
    attributes: { exampleBeaconAttribute: true },
    isIdle: cached,
    error:
      cached && ticketId === 3 ? new Error('Error loading ticket') : undefined,
  })

  // Start the customer sidebar trace when the ticket view loads
  useEffect(() => {
    customerSidebarTracer.start({
      relatedTo: { ticketId },
      attributes: {
        parentTrace: 'ticket-activation',
        sidebarType: 'customer_context',
      },
      variant: 'sidebar_open',
    })
  }, [ticketId])

  useEffect(
    () =>
      triggerLongTasks({
        minTime: 50,
        maxTime: 100,
        totalClusterDuration: 300,
      }),
    [ticketId, cached],
  )

  const ticket = mockTickets.find((ticket) => ticket.id === ticketId)

  useEffect(() => {
    const timer = setTimeout(() => {
      onLoaded?.()
    }, 500)
    return () => void clearTimeout(timer)
  }, [ticketId])

  useEffect(() => {
    if (!cached || stateX > 10) return undefined
    const timer = setTimeout(() => {
      // force trigger a re-render
      setStateX((prev) => prev + 1)
    }, 50)
    return () => void clearTimeout(timer)
  }, [stateX])

  if (!ticket) {
    return (
      <TicketViewContainer>
        <TicketContent>
          <Well>
            <Paragraph>No ticket found</Paragraph>
          </Well>
        </TicketContent>
        <CustomerSidebar ticketId={ticketId} />
      </TicketViewContainer>
    )
  }

  return (
    <TicketViewContainer>
      <TicketContent>
        <Well>
          <XXL>Ticket: {ticket.subject}</XXL>
          {!cached ? (
            <>
              <Skeleton />
              <Skeleton />
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </>
          ) : (
            <>
              <Timeline>
                <TimingComponent name={`TicketView/${ticketId}`} />
                {ticket.messages.map((msg, index) => (
                  <Timeline.Item key={index}>
                    <Timeline.OppositeContent>
                      <Span hue="grey">{msg.humanReadableTimestamp}</Span>
                    </Timeline.OppositeContent>
                    <TimelineContentWide>
                      <Avatar
                        size="extrasmall"
                        backgroundColor={PALETTE.grey[600]}
                      >
                        {msg.authorType === 'customer' ? (
                          <img
                            alt="image avatar"
                            src="https://garden.zendesk.com/components/avatar/user.png"
                          />
                        ) : (
                          <UserIcon
                            role="img"
                            aria-label="extra small user avatar"
                          />
                        )}
                      </Avatar>
                      <StyledSpan>{msg.author}</StyledSpan>
                      <MessageSpan>{msg.message}</MessageSpan>
                    </TimelineContentWide>
                  </Timeline.Item>
                ))}
              </Timeline>
            </>
          )}
        </Well>
      </TicketContent>
      <CustomerSidebar ticketId={ticketId} />
    </TicketViewContainer>
  )
}
