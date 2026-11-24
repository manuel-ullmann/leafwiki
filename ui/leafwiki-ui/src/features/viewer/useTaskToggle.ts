import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { updatePage, type Page } from '@/lib/api/pages'
import { mapApiError } from '@/lib/api/errors'
import { useIsReadOnly } from '@/lib/useIsReadOnly'
import { useTreeStore } from '@/stores/tree'
import { useViewerStore } from './viewer'

export function useTaskToggle(page: Page | null) {
  const readOnly = useIsReadOnly()
  const { t } = useTranslation('editor')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const onToggle = useCallback(
    async (offset: number, checked: boolean) => {
      if (readOnly || savingRef.current || !page) return
      // Reject callbacks from an obsolete render or a page that is being replaced.
      const viewer = useViewerStore.getState()
      if (viewer.page !== page || viewer.isLoading) return
      if (
        page.content.slice(offset - 1, offset + 2).match(/^\[[ xX]\]$/) === null
      )
        return
      const content =
        page.content.slice(0, offset) +
        (checked ? 'x' : ' ') +
        page.content.slice(offset + 1)
      if (content === page.content) return
      savingRef.current = true
      setSaving(true)
      try {
        const updated = await updatePage(
          page.id,
          page.version,
          page.title,
          page.slug,
          content,
          page.tags ?? [],
          page.properties ?? {},
        )
        if (!updated) throw new Error(t('pageEditor.saveErrorFallback'))
        const current = useViewerStore.getState()
        if (current.page === page && !current.isLoading) {
          useViewerStore.setState({ page: updated })
          useTreeStore.getState().patchNodeVersion(updated.id, updated.version)
        }
      } catch (error) {
        if (useViewerStore.getState().page === page) {
          toast.error(
            mapApiError(error, t('pageEditor.saveErrorFallback')).message,
          )
        }
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [page, readOnly, t],
  )
  return { onToggle, disabled: readOnly || saving }
}
