import * as RadixSelect from '@radix-ui/react-select'
import { useId } from 'react'

/**
 * A choice from a list, as the admin side's control.
 *
 * The second of the two Radix components the spec asks for, and the counterpart to
 * `NativeSelect`: that one is the client's, on a phone, where the browser's own picker is a
 * better one-handed control than any listbox we could build. This one is the admin's, at
 * 1280px, with a keyboard — where a listbox styled like the rest of the screen is worth the
 * focus management and ARIA that Radix gets right and a hand-rolled one quietly breaks.
 *
 * Copied in shadcn-style into the repository rather than imported wholesale, so the styling is
 * ours and there is one select in the application instead of three divergent ones.
 *
 * Options are data rather than children. The one caller fills them from an API response, so a
 * compound `Select.Item` API would only mean a `map` at the call site and a second way to get
 * a value wrong.
 */

export interface SelectOption {
  /**
   * Radix reserves the empty string for its placeholder, so every option needs a real value.
   * The one caller's "everyone" option is a named token rather than an absent one for exactly
   * that reason.
   */
  value: string
  label: string
}

export interface SelectProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
}

export function Select({ label, value, onValueChange, options }: SelectProps) {
  const labelId = useId()

  return (
    <div className="flex flex-col gap-1.5">
      {/*
       * A `span` rather than a `label`: Radix's trigger is a button, and `htmlFor` on a button
       * names nothing. `aria-labelledby` is what gives the trigger its accessible name, which
       * is how both a screen reader and the tests find this control by the word "Stylist".
       */}
      <span id={labelId} className="text-sm font-medium text-ink">
        {label}
      </span>

      <RadixSelect.Root value={value} onValueChange={onValueChange}>
        <RadixSelect.Trigger
          aria-labelledby={labelId}
          className={[
            'inline-flex min-h-11 items-center justify-between gap-2',
            'rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink',
            'data-[state=open]:border-primary',
          ].join(' ')}
        >
          <RadixSelect.Value />
          <RadixSelect.Icon aria-hidden="true" className="text-ink-faint">
            ▾
          </RadixSelect.Icon>
        </RadixSelect.Trigger>

        <RadixSelect.Portal>
          <RadixSelect.Content
            // Anchored to the trigger rather than covering it, so the day and the stylist stay
            // readable while the list is open.
            position="popper"
            sideOffset={4}
            className="z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-xl"
          >
            <RadixSelect.Viewport className="p-1">
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  className={[
                    'cursor-pointer rounded-md px-3 py-2 text-sm text-ink outline-none',
                    'data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary',
                    'data-[state=checked]:font-medium',
                  ].join(' ')}
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  )
}
