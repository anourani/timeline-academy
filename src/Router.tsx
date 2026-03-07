import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { App } from './App';
import { Homepage } from './components/Homepage/Homepage';
import { TimelineViewer } from './components/TimelineViewer/TimelineViewer';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Homepage />
  },
  {
    path: '/editor',
    element: <App />
  },
  {
    path: '/view/:timelineId',
    element: <TimelineViewer />
  },
  {
    path: '/timelines',
    element: <Navigate to="/" replace />
  }
]);

export function Router() {
  return <RouterProvider router={router} />;
}