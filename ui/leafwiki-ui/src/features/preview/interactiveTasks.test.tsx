import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useDesignModeStore } from '@/features/designtoggle/designmode'
import { InteractiveTaskPreview } from './interactiveTasks'

beforeEach(() => {
  useDesignModeStore.setState({ mode: 'light' })
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

function Fixture(props: {
  content: string
  onToggle: (offset: number, checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <MemoryRouter>
      <TooltipProvider>
        <InteractiveTaskPreview {...props} />
      </TooltipProvider>
    </MemoryRouter>
  )
}

describe('interactive Markdown tasks', () => {
  it.each([
    ['unchecked', '- [ ] Aufgabe', false],
    ['checked', '- [x] Aufgabe', true],
    ['uppercase', '- [X] Aufgabe', true],
    ['ordered', '1. [ ] Aufgabe', false],
    ['quoted', '> - [ ] Aufgabe', false],
    ['CRLF and Unicode', 'Äpfel 🍎\r\n\r\n- [ ] Aufgabe\r\n', false],
    ['normalized blocks', ':::info\nHinweis\n:::\n- [ ] Aufgabe', false],
    ['task inside block', ':::info\n- [ ] Aufgabe\n:::', false],
    ['wikilink before task', '[[Longer link]]\n\n- [ ] Aufgabe', false],
  ] as const)(
    'toggles %s at its original source position',
    (_, content, checked) => {
      const toggle = vi.fn()
      render(<Fixture content={content} onToggle={toggle} />)
      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toHaveAttribute('aria-checked', String(checked))
      fireEvent.click(checkbox)
      expect(toggle).toHaveBeenCalledExactlyOnceWith(
        content.search(/\[[ xX]\]/) + 1,
        !checked,
      )
    },
  )

  it('distinguishes repeated and nested tasks from fenced examples', () => {
    const content =
      '```md\n- [ ] Same\n```\n\n- [ ] Same\n  - [x] Same\n\n- [ ] Same'
    const toggle = vi.fn()
    render(<Fixture content={content} onToggle={toggle} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(3)
    boxes.forEach((box, i) => {
      fireEvent.click(box)
      const offsets = [...content.matchAll(/\[[ x]\]/g)].map((m) => m.index + 1)
      expect(toggle).toHaveBeenLastCalledWith(offsets[i + 1], i !== 1)
    })
  })

  it('keeps authored HTML inputs inert, including within genuine task items', () => {
    const toggle = vi.fn()
    const content =
      '<input type="checkbox">\n\n- [ ] Real <input type="checkbox">\n\n<li class="task-list-item"><input type="checkbox"></li>'
    render(<Fixture content={content} onToggle={toggle} />)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.filter((box) => !box.hasAttribute('disabled'))).toHaveLength(1)
    boxes
      .filter((box) => box.hasAttribute('disabled'))
      .forEach((box) => fireEvent.click(box))
    expect(toggle).not.toHaveBeenCalled()
    fireEvent.click(boxes.find((box) => !box.hasAttribute('disabled'))!)
    expect(toggle).toHaveBeenCalledExactlyOnceWith(
      content.indexOf('[ ]') + 1,
      true,
    )
  })

  it('disables tasks while saving or read-only', () => {
    const toggle = vi.fn()
    render(<Fixture content="- [ ] Task" onToggle={toggle} disabled />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(toggle).not.toHaveBeenCalled()
  })

  it('preserves the checkbox element and focus across save state and content updates', () => {
    const toggle = vi.fn()
    const { rerender } = render(
      <Fixture content="- [ ] Task" onToggle={toggle} />,
    )
    const checkbox = screen.getByRole('checkbox')
    checkbox.focus()
    rerender(<Fixture content="- [ ] Task" onToggle={toggle} disabled />)
    expect(screen.getByRole('checkbox')).toBe(checkbox)
    rerender(<Fixture content="- [x] Task" onToggle={toggle} />)
    expect(screen.getByRole('checkbox')).toBe(checkbox)
    expect(checkbox).toHaveFocus()
  })

  it('leaves ambiguous source correspondence disabled', () => {
    const toggle = vi.fn()
    render(
      <Fixture
        content={':::info Lost [ ]\n- [ ] Task\n:::'}
        onToggle={toggle}
      />,
    )
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
