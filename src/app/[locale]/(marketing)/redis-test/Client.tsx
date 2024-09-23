'use client';

import { useEffect, useState } from 'react';
import { increase, decrease, load } from './actions';
import { Button } from '@salesyy/common-ui/Button';

export default function Client() {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const init = async () => {
      const result = await load();
      if (result.counter) {
        setValue(parseInt(result.counter, 10));
      }
    };

    init();
  });

  const handleDecrease = async () => {
    const result = await decrease();
    setValue(result.counter);
  };

  const handleIncrease = async () => {
    const result = await increase();
    setValue(result.counter);
  };

  return (
    <div>
      <Button label="Decrease" onClick={handleDecrease} className="mr-2" />
      <span className="mr-2">Current value: {value}</span>
      <Button label="Increase" onClick={handleIncrease} />
    </div>
  );
}
