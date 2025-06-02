/* eslint-disable import/no-extraneous-dependencies */
import * as React from 'react'
import {
  Body,
  Caption,
  Head,
  HeaderCell,
  HeaderRow,
  Table,
} from '@zendeskgarden/react-tables'
import { XL } from '@zendeskgarden/react-typography'
import type { Ticket as TicketType } from './mockTickets'
import { Ticket } from './Ticket'

interface TicketListProps {
  tickets: TicketType[]
  onTicketClick: (id: number) => void
}

export const TicketList: React.FC<TicketListProps> = ({
  tickets,
  onTicketClick,
}) => (
  <div style={{ overflowX: 'auto' }}>
    <Table style={{ minWidth: 500 }}>
      <Caption>
        <XL>Ticket list</XL>
      </Caption>

      <Head>
        <HeaderRow>
          <HeaderCell width={70}>ID</HeaderCell>
          <HeaderCell>Title</HeaderCell>
        </HeaderRow>
      </Head>
      <Body>
        {tickets.map((ticket) => (
          <Ticket
            key={ticket.id}
            id={ticket.id}
            subject={ticket.subject}
            onClick={onTicketClick}
          />
        ))}
      </Body>
    </Table>
  </div>
)
