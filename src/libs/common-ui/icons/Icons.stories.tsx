import { Meta, StoryFn } from '@storybook/react';
import * as Icons from '../icons';

export default {
  title: 'Icons/AllIcons',
} as Meta;

export const AllIcons: StoryFn = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
    {Object.entries(Icons).map(([name, IconComponent]) => (
      <div
        key={name}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100px',
        }}
      >
        <IconComponent />
        <p style={{ marginTop: '10px', fontSize: '12px', textAlign: 'center' }}>
          {name}
        </p>
      </div>
    ))}
  </div>
);
