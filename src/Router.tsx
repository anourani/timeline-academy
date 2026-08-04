import { createBrowserRouter, RouterProvider, Outlet, Navigate } from 'react-router-dom';
import { App } from './App';
import { AIModePage } from './components/AIMode/AIModePage';
import { TimelineViewer } from './components/TimelineViewer/TimelineViewer';
import { PrivacyPolicyPage } from './components/Legal/PrivacyPolicyPage';
import { TermsPage } from './components/Legal/TermsPage';
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
      { path: '/', element: <AIModePage /> },
      { path: '/editor', element: <App /> },
      { path: '/ai', element: <Navigate to="/" replace /> },
    ],
  },
  {
    path: '/view/:timelineId',
    element: <TimelineViewer />,
  },
  {
    path: '/privacy',
    element: <PrivacyPolicyPage />,
  },
  {
    path: '/terms',
    element: <TermsPage />,
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
