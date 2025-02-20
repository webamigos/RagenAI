import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  closeSidebar as closeAction,
  openSidebar as openAction,
} from '@/store/features/sidebar/sidebarSlice';

export const useSidebar = () => {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.sidebar.isOpen);

  const openSidebar = () => dispatch(openAction());
  const closeSidebar = () => dispatch(closeAction());

  return {
    isOpen,
    openSidebar,
    closeSidebar,
  };
};
