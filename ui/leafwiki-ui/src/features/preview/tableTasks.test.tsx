import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useDesignModeStore } from '@/features/designtoggle/designmode'
import MarkdownPreview from './MarkdownPreview'
import { InteractiveTaskPreview } from './interactiveTasks'

beforeEach(() => {
  useDesignModeStore.setState({ mode: 'light' })
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

function Fixture({
  content,
  onToggle,
  disabled = false,
}: {
  content: string
  onToggle?: (offset: number, checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <MemoryRouter>
      <TooltipProvider>
        {onToggle ? (
          <InteractiveTaskPreview
            content={content}
            onToggle={onToggle}
            disabled={disabled}
          />
        ) : (
          <MarkdownPreview content={content} />
        )}
      </TooltipProvider>
    </MemoryRouter>
  )
}

const table = (cell: string) =>
  `| Task | Done |\n| --- | --- |\n| Apples | ${cell} |`

it.each(['[ ]', '[x]', '[X]', '[ ] Label'])(
  'renders %s as an inert checkbox in static previews',
  (marker) => {
    render(<Fixture content={table(marker)} />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
    expect(screen.getByRole('checkbox')).toHaveProperty(
      'checked',
      marker[1].toLowerCase() === 'x',
    )
  },
)

it.each([
  ['unchecked', table('[ ]'), false],
  ['checked', table('[x]'), true],
  ['uppercase', table('[X]'), true],
  ['labelled', table('[ ] Label'), false],
  [
    'CRLF Unicode',
    'Äpfel 🍎\r\n\r\n' + table('[ ]').replaceAll('\n', '\r\n'),
    false,
  ],
  ['normalized blocks', ':::info\nNote\n:::\n\n' + table('[ ]'), false],
  ['wikilink', '[[Longer link]]\n\n' + table('[ ]'), false],
  ['header', '| [ ] Header |\n| --- |\n| Text |', false],
] as const)(
  'toggles table tasks at their exact source position: %s',
  (_, content, checked) => {
    const toggle = vi.fn()
    render(<Fixture content={content} onToggle={toggle} />)
    const box = screen.getByRole('checkbox')
    expect(box).toHaveAttribute('aria-checked', String(checked))
    fireEvent.click(box)
    expect(toggle).toHaveBeenCalledExactlyOnceWith(
      content.search(/\[[ xX]\]/) + 1,
      !checked,
    )
  },
)

it.each([
  '`[ ]`',
  '\\[ ]',
  '[x](https://example.com)',
  'Text [ ]',
  '[ ]word',
  '[ ]**label**',
  '[ ]&#32;Label',
  '[ ]<em>Label</em>',
  '&#91; &#93;',
  '<span>[ ]</span>',
])('keeps non-task cell contents literal: %s', (cell) => {
  render(<Fixture content={table(cell)} onToggle={vi.fn()} />)
  expect(screen.queryByRole('checkbox')).toBeNull()
})

it('distinguishes cells, list tasks and fenced examples', () => {
  const content =
    '```md\n' +
    table('[ ]') +
    '\n```\n\n' +
    table('[x]') +
    '\n| Pears | [ ] |\n\n- [ ] List'
  const toggle = vi.fn()
  render(<Fixture content={content} onToggle={toggle} />)
  const offsets = [...content.matchAll(/\[[ xX]\]/g)].map((m) => m.index + 1)
  const boxes = screen.getAllByRole('checkbox')
  expect(boxes).toHaveLength(3)
  boxes.forEach((box, i) => {
    fireEvent.click(box)
    expect(toggle).toHaveBeenLastCalledWith(offsets[i + 1], i !== 0)
  })
})

it('keeps authored HTML inputs inert inside table cells and raw tables', () => {
  const toggle = vi.fn()
  render(
    <Fixture
      content={
        table('[ ] Real <input type="checkbox">') +
        '\n\n<table><tr><td>[ ]<input type="checkbox"></td></tr></table>'
      }
      onToggle={toggle}
    />,
  )
  const boxes = screen.getAllByRole('checkbox')
  expect(boxes).toHaveLength(3)
  expect(boxes.filter((box) => !box.hasAttribute('disabled'))).toHaveLength(1)
  boxes
    .filter((box) => box.hasAttribute('disabled'))
    .forEach((box) => fireEvent.click(box))
  expect(toggle).not.toHaveBeenCalled()
})

it('preserves the table checkbox and focus while saving and updating content', () => {
  const toggle = vi.fn()
  const { rerender } = render(
    <Fixture content={table('[ ]')} onToggle={toggle} />,
  )
  const box = screen.getByRole('checkbox')
  box.focus()
  rerender(<Fixture content={table('[ ]')} onToggle={toggle} disabled />)
  expect(screen.getByRole('checkbox')).toBe(box)
  expect(box).toBeDisabled()
  fireEvent.click(box)
  expect(toggle).not.toHaveBeenCalled()
  rerender(<Fixture content={table('[x]')} onToggle={toggle} />)
  expect(screen.getByRole('checkbox')).toBe(box)
  expect(box).toHaveFocus()
})

it('leaves table tasks inert if normalization removes a marker', () => {
  render(
    <Fixture
      content={':::info Lost [ ]\nNote\n:::\n\n' + table('[ ]')}
      onToggle={vi.fn()}
    />,
  )
  expect(screen.getByRole('checkbox')).toBeDisabled()
})
