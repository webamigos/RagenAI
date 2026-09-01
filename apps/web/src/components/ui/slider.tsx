'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => value ?? defaultValue ?? [min],
    [value, defaultValue, min],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="bg-zinc-200 dark:bg-zinc-700 relative h-1.5 w-full grow overflow-hidden rounded-full"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="bg-primary absolute h-full"
        />
      </SliderPrimitive.Track>
      {_values.map((_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="border-primary bg-background focus-visible:ring-ring/50 block size-4 rounded-full border-2 shadow-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
