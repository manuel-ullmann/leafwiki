import { useDesignModeStore } from '@/features/designtoggle/designmode'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import MarkdownPreview from './MarkdownPreview'

beforeEach(() => {
  useDesignModeStore.setState({ mode: 'light' })
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

it('composes optional renderers and plugins before sanitizing', () => {
  render(
    <TooltipProvider>
      <MarkdownPreview
        content="hello"
        components={{
          p: ({ children }) => <p title="extension">{children}</p>,
        }}
        rehypePlugins={[
          () => (tree) => {
            tree.children.push({
              type: 'element',
              tagName: 'script',
              properties: {},
              children: [{ type: 'text', value: 'unsafe' }],
            })
          },
        ]}
      />
    </TooltipProvider>,
  )
  expect(screen.getByTitle('extension')).toHaveTextContent('hello')
  expect(document.querySelector('script')).toBeNull()
})
