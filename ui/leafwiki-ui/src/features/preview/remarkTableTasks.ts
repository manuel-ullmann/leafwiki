import type { Parent, Root, TableCell, Text } from 'mdast'
import { visit } from 'unist-util-visit'

type TableTask = { markerOffset: number; checked: boolean; label: string }

// Only this plugin can register genuine Markdown cells. Author HTML and forged
// attributes never enter this map, and discarded syntax trees can be collected.
const tableTasks = new WeakMap<TableCell, TableTask>()

export function getTableTask(cell: TableCell) {
  return tableTasks.get(cell)
}

export function remarkTableTasks() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value)
    const rowLabels = new WeakMap<Parent, string>()
    visit(tree, 'tableCell', (cell, _index, row) => {
      const first = cell.children[0]
      if (first?.type !== 'text') return
      const start = first.position?.start.offset
      if (start === undefined) return
      const match = /^\[([ xX])\](?=[ \t\r\n]|$)/.exec(first.value)
      // The decoded AST text alone would also accept escapes and entities.
      if (
        !match ||
        !/^\[([ xX])\](?=[ \t\r\n]|$)/.test(
          source.slice(start, first.position?.end.offset),
        ) ||
        (first.value.length === 3 && cell.children.length > 1)
      )
        return
      let label = ''
      visit(cell, 'text', (text) => {
        label += text.value
      })
      label = label.slice(3).trim()
      if (!label && row) {
        label = rowLabels.get(row) ?? ''
        if (!rowLabels.has(row)) {
          visit(row, 'text', (text) => {
            label += text.value.replace(/^\[[ xX]\](?=\s|$)/, '') + ' '
          })
          label = label.trim()
          rowLabels.set(row, label)
        }
      }
      const task = { markerOffset: start + 1, checked: match[1] !== ' ', label }
      tableTasks.set(cell, task)
      const input: Text = {
        type: 'text',
        value: '',
        data: {
          hName: 'input',
          hProperties: {
            type: 'checkbox',
            checked: task.checked,
            disabled: true,
          },
          hChildren: [],
        },
      }
      first.value = first.value.slice(3)
      cell.children.unshift(input)
    })
  }
}
