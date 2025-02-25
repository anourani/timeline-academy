import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { TimelineViewer } from './components/TimelineViewer/TimelineViewer';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />
  },
  {
    path: '/view/:timelineId',
    element: <TimelineViewer />
  }
]);

export function Router() {
  return <RouterProvider router={router} />;
}