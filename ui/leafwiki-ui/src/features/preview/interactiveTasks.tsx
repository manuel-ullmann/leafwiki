import { Checkbox } from '@/components/ui/checkbox'
import type { ListItem, Root } from 'mdast'
import {
  Children,
  cloneElement,
  createContext,
  useContext,
  isValidElement,
  useMemo,
  type InputHTMLAttributes,
  type LiHTMLAttributes,
  type ReactNode,
} from 'react'
import type { Components, ExtraProps } from 'react-markdown'
import type { PluggableList } from 'unified'
import { visit } from 'unist-util-visit'
import { isPlainListParagraph } from './previewHelpers'
import { normalizeMarkdownBlocks } from './normalizeMarkdownBlocks'
import MarkdownPreview from './MarkdownPreview'

type Task = { offset: number; checked: boolean; label: string }
type InputProps = InputHTMLAttributes<HTMLInputElement> & ExtraProps

function InertInput({ node, ...props }: InputProps) {
  void node
  return <input {...props} disabled />
}

function taskMarkers(content: string) {
  return [...content.matchAll(/\[[ xX]\]/g)]
}

function sourceOffsets(original: string, normalized: string) {
  const source = taskMarkers(original)
  const rendered = taskMarkers(normalized)
  const blocks = taskMarkers(normalizeMarkdownBlocks(original))
  // Preprocessors preserve marker order. Refuse a document when a transform
  // removes or introduces markers, rather than guessing which source to edit.
  if (
    source.length !== blocks.length ||
    source.some((marker, i) => marker[0] !== blocks[i][0]) ||
    source.length !== rendered.length ||
    source.some((marker, i) => marker[0] !== rendered[i][0])
  )
    return new Map<number, number>()

  return new Map(
    rendered.flatMap((marker, i) => {
      const offset = source[i].index + 1
      const lineStart = original.lastIndexOf('\n', offset) + 1
      const prefix = original.slice(lineStart, offset - 1)
      if (!/^(?:[ \t]*>[ \t]*)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+$/.test(prefix))
        return []
      return [[marker.index + 1, offset]]
    }),
  )
}

function replaceCheckbox(children: ReactNode, checkbox: ReactNode): ReactNode {
  let replaced = false
  const replace = (items: ReactNode): ReactNode =>
    Children.map(items, (child) => {
      if (
        replaced ||
        !isValidElement<InputProps & { children?: ReactNode }>(child)
      )
        return child
      if (
        child.type === InertInput &&
        child.props.type === 'checkbox' &&
        !child.props.node?.position
      ) {
        replaced = true
        return checkbox
      }
      // GFM places the generated checkbox either directly in li or in its first
      // paragraph. Never search nested lists or author-written HTML containers.
      if (child.type === 'p')
        return cloneElement(child, { children: replace(child.props.children) })
      return child
    })
  return replace(children)
}

type TaskPreviewProps = {
  content: string
  path?: string
  onToggle: (offset: number, checked: boolean) => void
  disabled?: boolean
}

type TaskContextValue = {
  tasks: Map<number, Task>
  onToggle: TaskPreviewProps['onToggle']
  disabled: boolean
}

const TasksContext = createContext<TaskContextValue | null>(null)

function TaskListItem({
  node,
  children,
  ...props
}: LiHTMLAttributes<HTMLLIElement> & ExtraProps) {
  const context = useContext(TasksContext)
  const task = context?.tasks.get(node?.position?.start.offset ?? -1)
  const content =
    task && context
      ? replaceCheckbox(
          children,
          <Checkbox
            checked={task.checked}
            disabled={context.disabled}
            aria-label={task.label}
            className="align-middle"
            onCheckedChange={(checked) => {
              if (!context.disabled)
                context.onToggle(task.offset, checked === true)
            }}
          />,
        )
      : children
  const meaningful = Children.toArray(content)
  const onlyChild = meaningful[0]
  return (
    <li {...props}>
      {meaningful.length === 1 && isPlainListParagraph(onlyChild)
        ? onlyChild.props.children
        : content}
    </li>
  )
}

const components: Components = { input: InertInput, li: TaskListItem }

export function InteractiveTaskPreview({
  content,
  path,
  onToggle,
  disabled = false,
}: TaskPreviewProps) {
  const extension = useMemo(() => {
    const tasks = new Map<number, Task>()
    function remarkTasks() {
      return (tree: Root, file: { value: unknown }) => {
        tasks.clear()
        const normalized = String(file.value)
        const offsets = sourceOffsets(content, normalized)
        visit(tree, 'listItem', (node: ListItem) => {
          const start = node.position?.start.offset
          if (start === undefined || typeof node.checked !== 'boolean') return
          const match =
            /^(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\](?=[ \t\r\n]|$)/.exec(
              normalized.slice(start),
            )
          if (!match) return
          const markerOffset = start + match[0].lastIndexOf('[') + 1
          const offset = offsets.get(markerOffset)
          if (offset === undefined) return
          let label = ''
          const paragraph = node.children[0]
          if (paragraph)
            visit(paragraph, (child) => {
              if ('value' in child && typeof child.value === 'string')
                label += child.value
            })
          tasks.set(start, { offset, checked: node.checked, label })
        })
      }
    }
    return { tasks, remarkPlugins: [remarkTasks] as PluggableList }
  }, [content])
  const context = useMemo(
    () => ({ tasks: extension.tasks, onToggle, disabled }),
    [extension, onToggle, disabled],
  )
  return (
    <TasksContext.Provider value={context}>
      <MarkdownPreview
        content={content}
        path={path}
        components={components}
        remarkPlugins={extension.remarkPlugins}
      />
    </TasksContext.Provider>
  )
}
