import * as React from "react";
import { Input } from "./input";

export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value: number;
  onValue: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/** A numeric input that emits parsed, clamped numbers (empty → min ?? 0). */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValue, min, max, step, ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value === "" ? (min ?? 0) : Number(e.target.value);
          let v = Number.isFinite(raw) ? raw : (min ?? 0);
          if (min != null) v = Math.max(min, v);
          if (max != null) v = Math.min(max, v);
          onValue(v);
        }}
        {...props}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
