<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Bilingual product requirements

- The application supports English and Chinese. Any new or changed user-facing feature must work in both languages.
- Keep `S3` and the product name `Swift Transfer` in English in both locales.
- Add or update translations in the shared i18n dictionary instead of hard-coding user-facing strings in components.
- When adding or modifying UI, verify navigation labels, buttons, form labels, placeholders, empty states, loading states, errors, toasts, dialogs, and accessibility labels in both English and Chinese.
- Language selection must continue to support manual switching and first-visit browser/OS language detection: any Chinese locale, including Simplified and Traditional Chinese, should select Chinese; all other locales should select English.
