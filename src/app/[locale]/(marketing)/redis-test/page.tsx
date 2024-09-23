'use client';

import { useState } from 'react';
import { increase, decrease } from './actions';
import { Button } from '@salesyy/common-ui/Button';

export default function RedisTestPage() {
  const [value, setValue] = useState(0);

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
