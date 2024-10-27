import { ReactNode } from 'react';
import { Tooltip as ReactTooltip } from 'react-tooltip';

export type TooltipProps = {
  id: string;
  content: string;
  children: ReactNode;
  place?: 'top' | 'right' | 'bottom' | 'left';
  offset?: number;
  delayShow?: number;
  delayHide?: number;
  className?: string;
};

export const Tooltip = ({
  id,
  content,
  children,
  place = 'top',
  offset = 10,
  delayShow = 300,
  delayHide = 300,
  className,
}: TooltipProps) => {
  return (
    <>
      <div
        data-tooltip-id={id}
        data-tooltip-content={content}
        className={className}
        style={{ display: 'inline-block' }}
      >
        {children}
      </div>
      <ReactTooltip
        id={id}
        place={place}
        offset={offset}
        delayShow={delayShow}
        delayHide={delayHide}
        anchorSelect={`[data-tooltip-id="${id}"]`}
      />
    </>
  );
};
