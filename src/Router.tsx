import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { App } from './App';
import { Homepage } from './components/Homepage/Homepage';
import { TimelineViewer } from './components/TimelineViewer/TimelineViewer';
import { SidePanelProvider } from './contexts/SidePanelContext';
import { GlobalLayout } from './components/Layout/GlobalLayout';

function LayoutRoute() {
  return (
    <SidePanelProvider>
      <GlobalLayout>
        <Outlet />
      </GlobalLayout>
    </SidePanelProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <LayoutRoute />,
    children: [
      { path: '/', element: <Homepage /> },
      { path: '/editor', element: <App /> },
      { path: '/timelines', element: <Navigate to="/" replace /> },
    ],
  },
  {
    path: '/view/:timelineId',
    element: <TimelineViewer />,
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
