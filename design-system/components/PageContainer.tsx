import React from 'react'

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Max-width variant. 'default' suits most pages; 'wide' for data-heavy views */
  maxWidth?: 'default' | 'wide' | 'narrow'
  /** Remove horizontal padding — useful when a parent already applies it */
  noPadding?: boolean
}

const maxWidthClasses = {
  narrow: 'max-w-2xl',
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
}

/**
 * PageContainer
 * Wraps every page route. Enforces max-width, centered layout, and consistent
 * horizontal + vertical padding. Use as the outermost layout element inside a page.
 *
 * @example
 * <PageContainer>
 *   <PageHeader title="Today" />
 *   <Section title="Tasks">...</Section>
 * </PageContainer>
 */
export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  maxWidth = 'default',
  noPadding = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={[
        'w-full mx-auto',
        maxWidthClasses[maxWidth],
        noPadding ? '' : 'px-4 md:px-6',
        'py-6',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
