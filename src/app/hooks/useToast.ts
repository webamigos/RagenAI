import { toast } from 'react-toastify';

type ToastProps = {
  message: string;
  autoClose: number;
  position:
    | 'top-center'
    | 'top-left'
    | 'top-right'
    | 'bottom-center'
    | 'bottom-left'
    | 'bottom-right';
};

export const useToast = () => {
  const successToast = ({
    message,
    position,
    autoClose = 3000,
  }: ToastProps) => {
    toast.success(message, {
      position: position,
      autoClose: autoClose,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
    });
  };

  const errorToast = ({ message, position, autoClose = 3000 }: ToastProps) => {
    toast.error(message, {
      position: position,
      autoClose: autoClose,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
    });
  };

  const infoToast = ({ message, position, autoClose = 3000 }: ToastProps) => {
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
