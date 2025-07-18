import {
  type DragEventHandler,
  type ReactElement,
  useEffect,
  useState,
} from 'react'
import * as React from 'react'

export interface DropTargetProps {
  onDrop: DragEventHandler
  children: ReactElement
}

export const DropTarget = ({ onDrop, children }: DropTargetProps) => {
  const [isOver, setIsOver] = useState(false)

  const handleDragEnter: EventListener = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOver(true)
  }

  const handleDragLeave: DragEventHandler = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOver(false)
  }

  const handleDragOver: DragEventHandler = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop: DragEventHandler = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsOver(false)
    onDrop(e)
  }

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter)

    return () => void window.removeEventListener('dragenter', handleDragEnter)
  }, [])

  const c = isOver ? 'drop-target over' : 'drop-target'
  return (
    <>
      <div
        className={c}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      ></div>
      {children}
      <style>
        {
          /* css */ `.drop-target {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  visibility: hidden;
  opacity: .5;
  z-index: 9999;
}

.drop-target.over {
  visibility: initial;
  background: lightblue;
  border: 1px dashed;
  border-radius: 1rem;
}
`
        }
      </style>
    </>
  )
}
