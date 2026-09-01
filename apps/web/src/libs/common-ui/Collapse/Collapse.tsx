import { useRef, useState, useLayoutEffect } from 'react';
import clsx from 'clsx';

type CollapseProps = {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  duration?: number;
};

export const Collapse = ({
  isOpen,
  children,
  className,
  duration = 300,
}: CollapseProps) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState('0px');
  const [shouldRender, setShouldRender] = useState(isOpen);

  useLayoutEffect(() => {
    if (isOpen) {
      setShouldRender(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (contentRef.current) {
            setHeight(`${contentRef.current.scrollHeight}px`);
          }
        });
      });
    } else {
      if (contentRef.current) {
        setHeight(`${contentRef.current.scrollHeight}px`);
        requestAnimationFrame(() => {
          setHeight('0px');
        });
      }
      setTimeout(() => setShouldRender(false), duration);
    }
  }, [isOpen]);

  return (
    <div
      ref={contentRef}
      className={clsx('overflow-hidden transition-all ease-in-out', className)}
      style={{
        height: shouldRender ? height : '0px',
        transitionDuration: `${duration}ms`,
      }}
    >
      {shouldRender && children}
    </div>
  );
};
