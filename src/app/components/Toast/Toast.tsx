'use client';

import { ToastContainer } from 'react-toastify';

import 'react-toastify/dist/ReactToastify.css';
import { useTheme } from 'next-themes';

export const Toast = () => {
  const { theme } = useTheme();
  return (
    <ToastContainer
      position="top-right"
      autoClose={4000}
      hideProgressBar={true}
      newestOnTop={true}
      closeOnClick
      theme={theme === 'dark' ? 'dark' : 'colored'}
    />
  );
};
