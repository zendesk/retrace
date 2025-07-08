import styled from 'styled-components'
import { TooltipWithBounds } from '@visx/tooltip'
import { getColor } from '@zendeskgarden/react-theming'

export const StyledRect = styled.rect`
  shape-rendering: geometricPrecision;
`

export const StyledTooltip = styled(TooltipWithBounds)`
  font-family: ${(props) => props.theme.fonts.system};
  background-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.raised' })};
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.default' })};
  border: ${(props) => props.theme.borders.sm};
  border-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'border.default' })};
  border-radius: ${(props) => props.theme.borderRadii.md};
  box-shadow: ${(props) =>
    props.theme.shadows.lg(
      '2px',
      '4px',
      getColor({ theme: props.theme, variable: 'shadow.large' }),
    )};
  padding: ${(props) => props.theme.space.sm};
  max-width: 400px;
  max-height: 800px;
`

export const TooltipTitle = styled.strong`
  font-weight: ${(props) => props.theme.fontWeights.semibold};
  font-size: ${(props) => props.theme.fontSizes.md};
  color: ${(props) =>
    getColor({ theme: props.theme, variable: 'foreground.primary' })};
`

export const TooltipContent = styled.div`
  margin-top: ${(props) => props.theme.space.xs};
  font-size: ${(props) => props.theme.fontSizes.sm};
  opacity: 0.9;
`

export const Container = styled.div`
  display: flex;
`

export const ScrollContainer = styled.div<{ $isDetailsPanelOpen?: boolean }>`
  transition: all 0.2s ease-in-out;
  height: 100%;
  display: flex;
  flex-direction: column;
  max-width: ${(props) =>
    props.$isDetailsPanelOpen ? 'calc(100vw - 380px)' : '100vw'};
`

export const Header = styled.header`
  display: flex;
  flex-direction: row;
  padding: ${(props) => props.theme.space.xs};
  z-index: 1;
`

export const Title = styled.h1`
  font-size: ${(props) => props.theme.fontSizes.xl};
  color: ${(props) => props.theme.colors.neutralHue};
  font-family: ${(props) => props.theme.fonts.system};
  font-weight: ${(props) => props.theme.fontWeights.semibold};
`

export const Footer = styled.footer<{ width: number; height: number }>`
  position: sticky;
  bottom: 0;
  align-self: flex-end;
  background-color: ${(props) =>
    getColor({ theme: props.theme, variable: 'background.default' })};
  height: ${(props) => props.height}px;
  width: 100%;
`

export const FooterContent = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: flex-start;
  gap: ${(props) => props.theme.space.md};
  padding: 0 ${(props) => props.theme.space.md};
`
