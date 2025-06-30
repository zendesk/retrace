import * as React from 'react'
import { Table } from '@zendeskgarden/react-tables'
import { XL } from '@zendeskgarden/react-typography'
import type { Ticket as TicketType } from './mockTickets'
import { Ticket } from './Ticket'

interface TicketListProps {
  tickets: TicketType[]
  onTicketClick: (id: number) => void
}

export const TicketList: React.FC<TicketListProps> = ({ tickets, onTicketClick }) => (
  <div style={{ overflowX: 'auto' }}>
    <Table style={{ minWidth: 500 }}>
      <Table.Caption>
        <XL>Ticket list</XL>
      </Table.Caption>

      <Table.Head>
        <Table.HeaderRow>
          <Table.HeaderCell width={70}>ID</Table.HeaderCell>
          <Table.HeaderCell>Title</Table.HeaderCell>
        </Table.HeaderRow>
      </Table.Head>
      <Table.Body>
        {tickets.map((ticket) => (
          <Ticket
            key={ticket.id}
            id={ticket.id}
            subject={ticket.subject}
            onClick={onTicketClick}
          />
        ))}
      </Table.Body>
    </Table>
  </div>
)
