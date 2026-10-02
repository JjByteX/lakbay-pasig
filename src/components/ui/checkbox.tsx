import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Plain checkbox, same native-input-plus-accent-primary look the Category
 * dialog's Active toggle and the weekly hours Closed toggle already use,
 * given a shared home so admin tables stop hand-styling it. `indeterminate`
 * is the "some, not all" dash a select-all header needs; it is a DOM
 * property, not an attribute, so it is set in an effect.
 */
interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate = false, checked, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate && !checked;
    }, [indeterminate, checked]);

    return (
      <input
        ref={innerRef}
        type="checkbox"
        checked={checked}
        className={cn(
          "h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40",
          className
        )}
        {...props}
      />
    );
  }
);
Checkbox.displayName = "Checkbox";
