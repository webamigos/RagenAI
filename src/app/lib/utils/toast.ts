import { toast } from 'react-toastify';

export type ToastProps = {
  message: string;
  autoClose?: number;
  position?:
    | 'top-center'
    | 'top-left'
    | 'top-right'
    | 'bottom-center'
    | 'bottom-left'
    | 'bottom-right';
};

export const statusToast = () => {
  const successToast = ({
    message,
    position = 'top-right',
    autoClose = 3000,
  }: ToastProps) => {
    toast.success(message, {
      position: position,
      autoClose: autoClose,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      className: 'bg-success-green dark:bg-accent-dark-500',
      progressClassName: 'dark:bg-success-green',
    });
  };

  const errorToast = ({
    message,
    position = 'top-right',
    autoClose = 3000,
  }: ToastProps) => {
    toast.error(message, {
      position: position,
      autoClose: autoClose,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
    });
  };

  const infoToast = ({
    message,
    position = 'top-right',
    autoClose = 3000,
  }: ToastProps) => {
    toast.info(message, {
      position: position,
      autoClose: autoClose,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
    });
  };

  return { successToast, errorToast, infoToast };
};
