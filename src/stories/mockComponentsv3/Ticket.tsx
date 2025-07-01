import * as React from 'react'
import { Table } from '@zendeskgarden/react-tables'

interface TicketProps {
  id: number
  subject: string
  onClick: (id: number) => void
}

export const Ticket: React.FC<TicketProps> = ({ id, subject, onClick }) => (
  <Table.Row
    onClick={() => void onClick(id)}
    style={{ cursor: 'pointer' }}
    isStriped={id % 2 === 0}
  >
    <Table.Cell width={70}>{id}</Table.Cell>
    <Table.Cell>{subject}</Table.Cell>
  </Table.Row>
)
