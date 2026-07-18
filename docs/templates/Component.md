# Design System Component: [ComponentName]

* **Path**: `design-system/components/[ComponentName].tsx`
* **Styling Dependency**: `design-system/tokens.css`

---

## 1. Purpose

[Describe the utility of this component. When should developers use it? What are the standard interactive behaviors?]

## 2. API Design & Props

[Document the React props type signature. Include standard HTML component interfaces where appropriate.]

```typescript
interface ComponentNameProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}
```

## 3. Styling & Tokens

[Specify what tokens and custom CSS values from `tokens.css` are used. Document light/dark color mappings.]

* **Background**: `var(--color-bg-surface)` / `var(--color-bg-base)`
* **Borders**: `var(--color-border)`
* **Animations**: `var(--motion-ease-standard)`

## 4. Accessibility (A11y)

[List access patterns (ARIA roles, keyboard event intercepts like Esc/Enter/Arrow keys, focus outlines).]

* ARIA roles: `role="dialog"`, etc.
* Keyboard inputs: `Tab` for focus trap, `Esc` to close.
* Minimum click targets: Minimum height of `44px` (`--click-target-min`) for touch accessibility.
