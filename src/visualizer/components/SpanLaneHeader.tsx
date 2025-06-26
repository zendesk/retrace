import React from 'react'
import styled from 'styled-components'
import { getColor } from '@zendeskgarden/react-theming'
import type { HierarchicalSpanAndAnnotation } from '../types'

const HeaderContainer = styled.div<{ depth: number }>`
  display: flex;
  align-items: center;
  padding: 4px 8px;
  padding-left: ${({ depth }) => depth * 16 + 8}px;
  background-color: ${({ theme }) => getColor({ theme, variable: 'background.default' })};
  border-bottom: 1px solid ${({ theme }) => getColor({ theme, variable: 'border.default' })};
  user-select: none;
  cursor: pointer;
  
  &:hover {
    background-color: ${({ theme }) => getColor({ theme, variable: 'background.subtle' })};
  }
`

const ExpandCollapseIcon = styled.button<{ isExpanded: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-right: 8px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: ${({ theme }) => getColor({ theme, variable: 'foreground.subtle' })};
  
  &:hover {
    color: ${({ theme }) => getColor({ theme, variable: 'foreground.default' })};
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const SpanName = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => getColor({ theme, variable: 'foreground.default' })};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const HierarchyConnector = styled.div<{ depth: number }>`
  position: absolute;
  left: ${({ depth }) => depth * 16 - 8}px;
  top: 0;
  bottom: 0;
  width: 1px;
  background-color: ${({ theme }) => getColor({ theme, variable: 'border.subtle' })};
  
  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    width: 8px;
    height: 1px;
    background-color: ${({ theme }) => getColor({ theme, variable: 'border.subtle' })};
  }
`

interface SpanLaneHeaderProps {
  span: HierarchicalSpanAndAnnotation
  isExpanded: boolean
  onToggleExpansion: (spanId: string) => void
  depth: number
}

export function SpanLaneHeader({
  span,
  isExpanded,
  onToggleExpansion,
  depth
}: SpanLaneHeaderProps) {
  const hasChildren = span.children.length > 0
  
  const handleToggle = () => {
    if (hasChildren) {
      onToggleExpansion(span.span.id)
    }
  }
  
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleToggle()
    }
  }

  return (
    <HeaderContainer 
      depth={depth} 
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-label={`${span.span.name} span ${hasChildren ? (isExpanded ? 'expanded' : 'collapsed') : ''}`}
    >
      {depth > 0 && <HierarchyConnector depth={depth} />}
      
      <ExpandCollapseIcon
        isExpanded={isExpanded}
        disabled={!hasChildren}
        aria-hidden="true"
      >
        {hasChildren ? (isExpanded ? '−' : '+') : '•'}
      </ExpandCollapseIcon>
      
      <SpanName>{span.span.name}</SpanName>
    </HeaderContainer>
  )
}