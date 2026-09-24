import React from 'react'

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  error?: string
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(({
  children,
  className = '',
  error: _error,
  ...props
}, ref) => {
  return (
    <div ref={ref} className={`flex flex-col gap-1.5 w-full ${className}`} {...props}>
      {children}
    </div>
  )
})
FormField.displayName = 'FormField'

export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean
}

export const FormLabel = React.forwardRef<HTMLLabelElement, FormLabelProps>(({
  children,
  className = '',
  required = false,
  ...props
}, ref) => {
  return (
    <label
      ref={ref}
      className={`text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1 select-none ${className}`}
      {...props}
    >
      {children}
      {required && <span className="text-[var(--destructive)]">*</span>}
    </label>
  )
})
FormLabel.displayName = 'FormLabel'

export const FormControl = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <div ref={ref} className={`relative flex items-center w-full ${className}`} {...props}>
      {children}
    </div>
  )
})
FormControl.displayName = 'FormControl'

export const FormDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <p
      ref={ref}
      className={`text-[11px] text-[var(--muted-foreground)] leading-normal ${className}`}
      {...props}
    >
      {children}
    </p>
  )
})
FormDescription.displayName = 'FormDescription'

export const FormError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({
  children,
  className = '',
  ...props
}, ref) => {
  if (!children) return null
  return (
    <p
      ref={ref}
      className={`text-xs font-medium text-[var(--destructive)] leading-normal animate-in fade-in-0 duration-150 ${className}`}
      {...props}
    >
      {children}
    </p>
  )
})
FormError.displayName = 'FormError'
