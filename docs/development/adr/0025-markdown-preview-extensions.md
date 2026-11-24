# ADR-0025: Compose Markdown preview extensions at the caller

## Status

Proposed (2026-11-24)

## Context

Interactive Markdown features need custom renderers and parser plugins without adding
feature-specific branches to the shared `MarkdownPreview` component.

## Decision

`MarkdownPreview` accepts optional `components`, `remarkPlugins` and `rehypePlugins`,
using the corresponding ReactMarkdown types. Component overrides take precedence over
built-in renderers. Remark extensions follow the default remark plugins; rehype extensions
run after the built-in structural transforms and before sanitization. The existing sanitizer,
math rendering, syntax highlighting and URL transform remain in place.

Callers own feature state and register their extensions. Without extensions, behavior is
unchanged. Extensions are trusted application code, never loaded from page content.

## Alternatives considered

- Task-specific callbacks in `MarkdownPreview`: couple shared rendering to one feature.
- A second Markdown renderer: duplicates normalization and security configuration.
- DOM event handlers on rendered HTML: cannot reliably distinguish genuine Markdown tasks
  from author-written HTML or retain source correspondence.

## Consequences

New features can customize rendering without modifying `MarkdownPreview` again. Callers
must preserve the security contracts of any renderer they override. Plugins cannot bypass
the sanitizer through their registration position. No runtime dependency or format changes.
