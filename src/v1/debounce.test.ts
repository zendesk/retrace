import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vitest as jest,
} from 'vitest'
import {
  debounce,
  type DebouncedFn,
  type DebounceOptionsRef,
  DebounceReason,
  TimeoutReason,
} from './debounce'

describe('debounce', () => {
  let mockFn: Mock
  let optionsRef: DebounceOptionsRef<readonly [string]>
  let debouncedFn: DebouncedFn<readonly [string]>

  beforeEach(() => {
    jest.useFakeTimers()

    mockFn = jest.fn()
    optionsRef = {
      fn: mockFn,
      debounceMs: 100,
    }

    debouncedFn = debounce(optionsRef)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should call the debounced function once after the debounce period', () => {
    debouncedFn('test')
    expect(mockFn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(100)
    expect(mockFn).toHaveBeenCalledWith('test', DebounceReason)
  })

  it('should not call the debounced function if it is cancelled before the debounce period', () => {
    debouncedFn('test')
    expect(mockFn).not.toHaveBeenCalled()
    debouncedFn.cancel()
    jest.advanceTimersByTime(100)
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('should call the debounced function with the TimeoutReason if a timeout is set', () => {
    debouncedFn = debounce({ ...optionsRef, timeoutMs: 200 })
    debouncedFn('test')
    expect(mockFn).not.toHaveBeenCalled()
    // keep timeout after regular debounce:
    mockFn.mockReturnValue(true)
    jest.advanceTimersByTime(200)
    expect(mockFn).toHaveBeenNthCalledWith(1, 'test', DebounceReason)
    expect(mockFn).toHaveBeenNthCalledWith(2, 'test', TimeoutReason)
  })

  it('should reset the debounce function state', () => {
    debouncedFn('test')
    debouncedFn.reset()
    expect(debouncedFn.getIsScheduled()).toBe(false)
    expect(debouncedFn.reset()).toBeUndefined()
    jest.advanceTimersByTime(100)
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('should manually flush the debounced function', () => {
    debouncedFn('test')
    const wasFlushed = debouncedFn.flush()
    expect(wasFlushed).toBe(true)
    expect(mockFn).toHaveBeenCalledWith('test', 'manual')
  })

  it('should not flush if there is nothing scheduled', () => {
    const wasFlushed = debouncedFn.flush()
    expect(wasFlushed).toBe(false)
    expect(mockFn).not.toHaveBeenCalled()
  })

  it('should keep the timeout if the debounced function returns true', () => {
    mockFn.mockReturnValue(true)
    debouncedFn = debounce({ ...optionsRef, timeoutMs: 200 })
    debouncedFn('test')
    jest.advanceTimersByTime(100)
    expect(mockFn).toHaveBeenCalledWith('test', DebounceReason)
    expect(debouncedFn.getIsScheduled()).toBe(true)
  })

  it('should clear the timeout if the debounced function returns false', () => {
    mockFn.mockReturnValue(false)
    debouncedFn = debounce({ ...optionsRef, timeoutMs: 200 })
    debouncedFn('test')
    jest.advanceTimersByTime(100)
    expect(mockFn).toHaveBeenCalledWith('test', DebounceReason)
    expect(debouncedFn.getIsScheduled()).toBe(false)
  })

  it('should pass FlushReason as the last argument to the debounced function', () => {
    debouncedFn('test')
    jest.advanceTimersByTime(100)
    expect(mockFn).toHaveBeenCalledWith('test', DebounceReason)
  })

  it('should correctly handle optionsRef being mutated after the debounced function was created', () => {
    debouncedFn('test')

    const otherMockFn = jest.fn()
    optionsRef.debounceMs = 200
    optionsRef.timeoutMs = 300
    optionsRef.fn = otherMockFn

    debouncedFn('test2')

    jest.advanceTimersByTime(100)
    expect(mockFn).not.toHaveBeenCalled()
    expect(otherMockFn).not.toHaveBeenCalled()

    jest.advanceTimersByTime(100)
    expect(mockFn).not.toHaveBeenCalled()
    expect(otherMockFn).toHaveBeenLastCalledWith('test2', DebounceReason)

    otherMockFn.mockReturnValue(true)
    debouncedFn('test3')
    jest.advanceTimersByTime(200)
    expect(mockFn).not.toHaveBeenCalled()
    expect(otherMockFn).toHaveBeenLastCalledWith('test3', DebounceReason)

    jest.advanceTimersByTime(100)
    expect(otherMockFn).toHaveBeenLastCalledWith('test3', TimeoutReason)
  })

  it('should correctly call the underlying function once, even when run multiple times in a row with different arguments', () => {
    debouncedFn('test1')
    debouncedFn('test2')
    debouncedFn('test3')

    expect(mockFn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(100)
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith('test3', DebounceReason)
  })
})
