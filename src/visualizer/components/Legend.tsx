/* eslint-disable import/no-extraneous-dependencies */
import * as React from 'react'
import styled from 'styled-components'
import { Card, CardContent, CardTitle } from './styled/Card'

const LegendContainer = styled(Card)`
  min-width: 400px;
  max-height: 80px;
  overflow-y: auto;
`

interface LegendProps {
  children: React.ReactNode
}

export const LegendGroup: React.FC<LegendProps> = ({ children }) => (
  <LegendContainer>
    <CardTitle>Legend</CardTitle>
    <CardContent>{children}</CardContent>
  </LegendContainer>
)
