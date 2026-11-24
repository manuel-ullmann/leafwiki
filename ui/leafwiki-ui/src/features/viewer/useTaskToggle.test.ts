import { act, renderHook } from '@testing-library/react'
import { updatePage, type Page } from '@/lib/api/pages'
import { useViewerStore } from './viewer'
import { useTreeStore } from '@/stores/tree'
import { useConfigStore } from '@/stores/config'
import { useSessionStore } from '@/stores/session'
import { useTaskToggle } from './useTaskToggle'
import { ApiLocalizedError } from '@/lib/api/errors'
import { toast } from 'sonner'

vi.mock('@/lib/api/pages', () => ({ updatePage: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const page: Page = {
  id: 'one',
  title: 'Tasks',
  slug: 'tasks',
  path: '/tasks',
  version: '1',
  content: '- [ ] Task\r\n',
  kind: 'page',
  tags: ['tag'],
  properties: { custom: 'value' },
}

beforeEach(() => {
  vi.clearAllMocks()
  useViewerStore.setState({ page, isLoading: false })
  useConfigStore.setState({ authDisabled: true, publicAccess: false })
  useSessionStore.setState({ user: null })
  vi.spyOn(useTreeStore.getState(), 'patchNodeVersion').mockImplementation(
    () => {},
  )
})

it('saves only the marker with the existing version and page fields', async () => {
  const updated = { ...page, content: '- [x] Task\r\n', version: '2' }
  vi.mocked(updatePage).mockResolvedValue(updated)
  const { result } = renderHook(() => useTaskToggle(page))
  await act(() => result.current.onToggle(3, true))
  expect(updatePage).toHaveBeenCalledWith(
    'one',
    '1',
    'Tasks',
    'tasks',
    updated.content,
    ['tag'],
    { custom: 'value' },
  )
  expect(useViewerStore.getState().page).toEqual(updated)
})

it('blocks rapid concurrent writes and ignores responses after navigation', async () => {
  let resolve!: (value: Page) => void
  vi.mocked(updatePage).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { result } = renderHook(() => useTaskToggle(page))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.onToggle(3, true)
  })
  expect(result.current.busy).toBe(true)
  expect(result.current.disabled).toBe(false)
  await act(() => result.current.onToggle(3, true))
  expect(updatePage).toHaveBeenCalledTimes(1)
  const other = { ...page, id: 'two' }
  useViewerStore.setState({ page: other })
  await act(async () => {
    resolve({ ...page, version: '2' })
    await pending
  })
  expect(useViewerStore.getState().page).toEqual(other)
})

it.each([
  new Error('offline'),
  new ApiLocalizedError({
    code: 'page_version_conflict',
    message: 'Conflict',
    template: 'page_version_conflict',
  }),
  null,
])('preserves source on save failure: %s', async (failure) => {
  if (failure) vi.mocked(updatePage).mockRejectedValue(failure)
  else vi.mocked(updatePage).mockResolvedValue(null)
  const { result } = renderHook(() => useTaskToggle(page))
  await act(() => result.current.onToggle(3, true))
  expect(useViewerStore.getState().page).toEqual(page)
  expect(result.current.disabled).toBe(false)
  expect(updatePage).toHaveBeenCalledTimes(1)
  expect(toast.error).toHaveBeenCalledOnce()
})

it('refuses writes for a viewer role', async () => {
  useConfigStore.setState({ authDisabled: false })
  useSessionStore.setState({
    user: {
      id: 'reader',
      role: 'viewer',
      username: 'reader',
      email: '',
      totpEnabled: false,
    },
  })
  const { result } = renderHook(() => useTaskToggle(page))
  await act(() => result.current.onToggle(3, true))
  expect(result.current.disabled).toBe(true)
  expect(updatePage).not.toHaveBeenCalled()
})

it.each([
  ['anonymous public visitor', null, true, false],
  ['anonymous with auth disabled', null, true, true],
  ['editor', 'editor', false, false],
  ['admin', 'admin', false, false],
] as const)(
  'uses existing edit permissions for %s',
  async (_, role, publicAccess, authDisabled) => {
    useConfigStore.setState({ publicAccess, authDisabled })
    useSessionStore.setState({
      user: role
        ? { id: 'user', role, username: 'user', email: '', totpEnabled: false }
        : null,
    })
    vi.mocked(updatePage).mockResolvedValue({ ...page, version: '2' })
    const { result } = renderHook(() => useTaskToggle(page))
    await act(() => result.current.onToggle(3, true))
    const allowed = authDisabled || role !== null
    expect(result.current.disabled).toBe(!allowed)
    expect(updatePage).toHaveBeenCalledTimes(allowed ? 1 : 0)
  },
)

it.each([
  ['invalid marker offset', 2, false, false],
  ['already requested state', 3, false, false],
  ['loading page', 3, true, true],
  ['replaced snapshot of the same page', 3, true, false],
] as const)('does not save %s', async (name, offset, checked, isLoading) => {
  useViewerStore.setState({
    page:
      name === 'replaced snapshot of the same page'
        ? { ...page, version: '2' }
        : page,
    isLoading,
  })
  const { result } = renderHook(() => useTaskToggle(page))
  await act(() => result.current.onToggle(offset, checked))
  expect(updatePage).not.toHaveBeenCalled()
})

it('uses the returned version for the next toggle and updates the tree version', async () => {
  const updated = { ...page, content: '- [x] Task\r\n', version: '2' }
  const unchecked = { ...page, version: '3' }
  vi.mocked(updatePage)
    .mockResolvedValueOnce(updated)
    .mockResolvedValueOnce(unchecked)
  const { result } = renderHook(() =>
    useTaskToggle(useViewerStore((s) => s.page)),
  )
  await act(() => result.current.onToggle(3, true))
  await act(() => result.current.onToggle(3, false))
  expect(updatePage).toHaveBeenNthCalledWith(
    2,
    'one',
    '2',
    'Tasks',
    'tasks',
    page.content,
    ['tag'],
    { custom: 'value' },
  )
  expect(useTreeStore.getState().patchNodeVersion).toHaveBeenLastCalledWith(
    'one',
    '3',
  )
})

it('does not replace a freshly reloaded snapshot with an older save response', async () => {
  let resolve!: (value: Page) => void
  vi.mocked(updatePage).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { result } = renderHook(() => useTaskToggle(page))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.onToggle(3, true)
  })
  const fresh = { ...page, content: '- [ ] New server content', version: '3' }
  useViewerStore.setState({ page: fresh })
  await act(async () => {
    resolve({ ...page, version: '2' })
    await pending
  })
  expect(useViewerStore.getState().page).toEqual(fresh)
  expect(useTreeStore.getState().patchNodeVersion).not.toHaveBeenCalled()
})

it('saves a selected table marker without changing neighbouring cells or page fields', async () => {
  const content =
    '| Task | Done |\r\n| --- | --- |\r\n| Äpfel 🍎 | [ ] |\r\n| Pears | [X] |\r\n'
  const tablePage = { ...page, content }
  useViewerStore.setState({ page: tablePage })
  const offset = content.indexOf('[ ]') + 1
  const updated = {
    ...tablePage,
    content: content.slice(0, offset) + 'x' + content.slice(offset + 1),
    version: '2',
  }
  vi.mocked(updatePage).mockResolvedValue(updated)
  const { result } = renderHook(() => useTaskToggle(tablePage))
  await act(() => result.current.onToggle(offset, true))
  expect(updatePage).toHaveBeenCalledExactlyOnceWith(
    page.id,
    page.version,
    page.title,
    page.slug,
    updated.content,
    page.tags,
    page.properties,
  )
  expect(useViewerStore.getState().page).toEqual(updated)
})
