import React, { useState, useEffect, useCallback, useRef } from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";

interface DebouncedInputProps extends Omit<InputProps, "onChange" | "value"> {
  value: string | number;
  onValueChange: (value: string) => void;
  delay?: number;
}

export function DebouncedInput({
  value,
  onValueChange,
  delay = 300,
  ...props
}: DebouncedInputProps) {
  const [localValue, setLocalValue] = useState(value?.toString() || "");
  const debouncedValue = useDebounce(localValue, delay);
  const isInternalChange = useRef(false);
  const lastPropValue = useRef(value?.toString() || "");

  // Update local value when prop value changes from external source
  useEffect(() => {
    const newValue = value?.toString() || "";
    // Only update if the prop value actually changed and it's not from our own update
    if (newValue !== lastPropValue.current && !isInternalChange.current) {
      setLocalValue(newValue);
      lastPropValue.current = newValue;
    }
    isInternalChange.current = false;
  }, [value]);

  // Call onValueChange when debounced value changes
  useEffect(() => {
    // Only trigger if the debounced value is different from the current prop value
    if (debouncedValue !== lastPropValue.current) {
      isInternalChange.current = true;
      onValueChange(debouncedValue);
    }
  }, [debouncedValue, onValueChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  return (
    <Input
      {...props}
      value={localValue}
      onChange={handleChange}
    />
  );
}