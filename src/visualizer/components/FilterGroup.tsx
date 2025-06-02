/* eslint-disable import/no-extraneous-dependencies */
import * as React from 'react'
import styled from 'styled-components'
import { ToggleButton } from '@zendeskgarden/react-buttons'
import { Grid } from '@zendeskgarden/react-grid'
import { Tooltip } from '@zendeskgarden/react-tooltips'
import { FILTER_OPTIONS, type FilterOption } from '../constants'
import { Card, CardContent } from './styled/Card'

const FilterContainer = styled(Card)`
  min-width: 300px;
`

const ButtonGroup = styled.div`
  display: flex;
  gap: ${(props) => props.theme.space.sm};
  flex-wrap: wrap;
`

interface FilterGroupProps {
  state: Record<string, boolean>
  setState: React.Dispatch<React.SetStateAction<Record<FilterOption, boolean>>>
}

export const FilterGroup: React.FC<FilterGroupProps> = ({
  state,
  setState,
}) => (
  <FilterContainer>
    <CardContent>
      <Grid.Row>
        <Grid.Col>
          <ButtonGroup>
            {FILTER_OPTIONS.map((option) => (
              <Tooltip key={option} content={option}>
                <ToggleButton
                  isPressed={state[option]}
                  onClick={() =>
                    void setState((prev) => ({
                      ...prev,
                      [option]: !prev[option],
                    }))
                  }
                >
                  {option}
                </ToggleButton>
              </Tooltip>
            ))}
          </ButtonGroup>
        </Grid.Col>
      </Grid.Row>
    </CardContent>
  </FilterContainer>
)
