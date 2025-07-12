import styled from 'styled-components'
import { getColor } from '@zendeskgarden/react-theming'

export const Card = styled.div`
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.subtle' })};
  font-size: ${(props) => props.theme.fontSizes.sm};
  font-family: ${(props) => props.theme.fonts.system};
  padding: ${(props) => props.theme.space.sm};
  border: ${(props) => props.theme.borders.sm};
  border-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'border.default' })};
  border-radius: ${(props) => props.theme.borderRadii.md};
  margin: ${(props) => props.theme.space.xs};
  background-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.default' })};
`

export const CardTitle = styled.div`
  font-size: ${(props) => props.theme.fontSizes.md};
  margin-bottom: ${(props) => props.theme.space.sm};
  font-weight: ${(props) => props.theme.fontWeights.light};
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.default' })};
`

export const CardContent = styled.div<{
  minWidth?: string
  maxHeight?: string
  overflowY?: string
}>`
  min-width: ${(props) => props.minWidth ?? 'auto'};
  max-height: ${(props) => props.maxHeight};
  overflow-y: ${(props) => props.overflowY ?? 'visible'};
`
