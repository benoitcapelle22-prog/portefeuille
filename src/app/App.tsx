import { RouterProvider } from 'react-router';
import { router } from './routes';
import { Toaster } from './components/ui/sonner';
import { ConfirmDialogHost } from './components/ConfirmDialogHost';
import '../styles/index.css';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
      <ConfirmDialogHost />
    </>
  );
}
