export interface TicketIdRelationSchemasFixture {
  readonly ticket: {
    readonly ticketId: StringConstructor
  }
}
export interface UserIdRelationSchemasFixture {
  readonly user: {
    readonly userId: StringConstructor
  }
}
export interface GlobalRelationSchemasFixture {
  readonly global: Record<string, never>
}

export interface TicketAndUserAndGlobalRelationSchemasFixture
  extends
    TicketIdRelationSchemasFixture,
    UserIdRelationSchemasFixture,
    GlobalRelationSchemasFixture {}

export const ticketAndUserAndGlobalRelationSchemasFixture: TicketAndUserAndGlobalRelationSchemasFixture =
  {
    global: {},
    ticket: { ticketId: String },
    user: { userId: String },
  } as const
