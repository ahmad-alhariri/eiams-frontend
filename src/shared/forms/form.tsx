import {
  cloneElement,
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerFieldState,
  type ControllerProps,
  type ControllerRenderProps,
  type FieldError,
  type FieldPath,
  type FieldValues,
  type FormProviderProps,
  type FormState,
} from 'react-hook-form'

import { Label } from '@/shared/ui/label'
import { cn } from '@/shared/utils/class-names'

/**
 * FormField provides the field name; FormItem owns a stable per-field id.
 * useFormField() merges both and derives the a11y ids every part consumes.
 */
interface FormFieldContextValue {
  name: string
  required: boolean
}

interface FormItemContextValue {
  id: string
  /** Set by FormDescription while mounted, cleared on unmount. */
  descriptionId: string | undefined
  /** Set by FormMessage while a body exists, cleared otherwise. */
  messageId: string | undefined
  setDescriptionId: (id: string | undefined) => void
  setMessageId: (id: string | undefined) => void
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null)
const FormItemContext = createContext<FormItemContextValue | null>(null)

export interface UseFormFieldReturn {
  /** Generated id owned by the surrounding FormItem. */
  id: string
  /** Field path from the surrounding FormField. */
  name: string
  formItemId: string
  /** Present only while a FormDescription is mounted. */
  formDescriptionId: string | undefined
  /** Present only while a FormMessage body exists. */
  formMessageId: string | undefined
  /** Mirrors rules.required when declared; define the field's aria-required. */
  required: boolean
  /** Registers the description id while a FormDescription is mounted. */
  setDescriptionId: (id: string | undefined) => void
  /** Registers the message id while a FormMessage body exists. */
  setMessageId: (id: string | undefined) => void
  error?: FieldError
  invalid: boolean
  isTouched: boolean
  isDirty: boolean
  isValidating: boolean
}

function useFormField(): UseFormFieldReturn {
  const fieldContext = useContext(FormFieldContext)
  const itemContext = useContext(FormItemContext)
  const { getFieldState, formState } = useFormContext()
  if (fieldContext === null) {
    throw new Error('useFormField يجب استخدامه داخل <FormField>')
  }
  if (itemContext === null) {
    throw new Error('useFormField يجب استخدامه داخل <FormItem>')
  }
  const fieldState = getFieldState(fieldContext.name, formState)
  return {
    id: itemContext.id,
    name: fieldContext.name,
    formItemId: `form-item-${itemContext.id}`,
    formDescriptionId: itemContext.descriptionId
      ? `form-item-description-${itemContext.descriptionId}`
      : undefined,
    formMessageId: itemContext.messageId ? `form-item-message-${itemContext.messageId}` : undefined,
    required: fieldContext.required,
    setDescriptionId: itemContext.setDescriptionId,
    setMessageId: itemContext.setMessageId,
    ...fieldState,
  }
}

function Form<TValues extends FieldValues, TContext = unknown, TTransformedValues = TValues>({
  'data-slot': dataSlot = 'form',
  ...props
}: FormProviderProps<TValues, TContext, TTransformedValues> & {
  'data-slot'?: string
}) {
  return <FormProvider {...{ ...props, 'data-slot': dataSlot }} />
}

export interface FormFieldRenderArgs<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> {
  field: ControllerRenderProps<TValues, TName>
  fieldState: ControllerFieldState
  formState: FormState<TValues>
}

export type FormFieldProps<TValues extends FieldValues, TName extends FieldPath<TValues>> = Omit<
  ControllerProps<TValues, TName>,
  'render'
> & {
  render: (args: FormFieldRenderArgs<TValues, TName>) => ReactNode
}

/**
 * Typed Controller wrapper. `render` receives the Controller tuple
 * ({ field, fieldState, formState }) and runs inside a context that shares
 * the field name with FormItem consumers. For schema-driven forms, pass
 * `rules={{ required: true }}` to surface aria-required on the control.
 */
function FormField<TValues extends FieldValues, TName extends FieldPath<TValues>>({
  render,
  ...props
}: FormFieldProps<TValues, TName>) {
  return (
    <Controller<TValues, TName>
      {...props}
      render={({ field, fieldState, formState }) => (
        <FormFieldContext.Provider
          value={{ name: props.name, required: Boolean(props.rules?.required) }}
        >
          {render({ field, fieldState, formState })}
        </FormFieldContext.Provider>
      )}
    />
  )
}

export interface FormItemProps {
  className?: string
  children: ReactNode
}

function FormItem({ className, children }: FormItemProps) {
  const id = useId()
  const [descriptionId, setDescriptionId] = useState<string | undefined>(undefined)
  const [messageId, setMessageId] = useState<string | undefined>(undefined)
  return (
    <FormItemContext.Provider
      value={{ id, descriptionId, messageId, setDescriptionId, setMessageId }}
    >
      <div data-slot="form-item" className={cn('grid gap-2', className)}>
        {children}
      </div>
    </FormItemContext.Provider>
  )
}

export type FormLabelProps = ComponentPropsWithoutRef<typeof Label>

function FormLabel({ className, ...props }: FormLabelProps) {
  const { error, formItemId } = useFormField()
  return (
    <Label
      htmlFor={formItemId}
      data-slot="form-label"
      data-error={error ? 'true' : undefined}
      className={cn(error && 'text-destructive', className)}
      {...props}
    />
  )
}

export interface FormControlProps {
  children: ReactElement
}

/**
 * Composes a single control element (Input, Textarea, ...) with the field's
 * id, described-by, invalid, and required semantics taken from the context.
 */
function FormControl({ children }: FormControlProps) {
  const { error, formItemId, formDescriptionId, formMessageId, required } = useFormField()
  const controlProps: Record<string, unknown> = {
    id: formItemId,
    'aria-describedby':
      [formDescriptionId, error ? formMessageId : ''].filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
  }
  return cloneElement(children, controlProps)
}

export type FormDescriptionProps = ComponentPropsWithoutRef<'p'>

function FormDescription({ className, ...props }: FormDescriptionProps) {
  const { id, formDescriptionId, setDescriptionId } = useFormField()
  useLayoutEffect(() => {
    setDescriptionId(id)
    return () => setDescriptionId(undefined)
  }, [id, setDescriptionId])
  return (
    <p
      id={formDescriptionId}
      data-slot="form-description"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

export type FormMessageProps = ComponentPropsWithoutRef<'p'>

/**
 * Inline Arabic field message; rendered only while an error exists. The
 * message is announced politely (aria-live) whenever it appears.
 */
function FormMessage({ className, children, ...props }: FormMessageProps) {
  const { error, id, formMessageId, setMessageId } = useFormField()
  const body = error ? String(error.message ?? '') : children
  useLayoutEffect(() => {
    if (!body) {
      setMessageId(undefined)
      return
    }
    setMessageId(id)
    return () => setMessageId(undefined)
  }, [body, id, setMessageId])
  if (!body) {
    return null
  }
  return (
    <p
      id={formMessageId}
      data-slot="form-message"
      aria-live="polite"
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  )
}

// Form exports shared field plumbing alongside components; fast-refresh prefers components-only files.
/* eslint-disable react-refresh/only-export-components */
export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
}
