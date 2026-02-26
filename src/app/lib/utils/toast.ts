import { toast } from 'sonner';

export type ToastProps = {
  message: string;
};

export const statusToast = () => {
  const successToast = ({ message }: ToastProps) => {
    toast.success(message);
  };

  const errorToast = ({ message }: ToastProps) => {
    toast.error(message);
  };

  const infoToast = ({ message }: ToastProps) => {
    toast.info(message);
  };

  return { successToast, errorToast, infoToast };
};
