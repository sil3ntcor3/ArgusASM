import { cloneElement, type ReactElement } from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderEntry: vi.fn<(element: ReactElement) => void>(),
  session: { data: null as { user: { id: string } } | null, isPending: true },
  preloadRoute: vi.fn().mockResolvedValue(undefined),
  invalidate: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn().mockResolvedValue(undefined),
  loadWorkspaces: vi.fn().mockResolvedValue([]),
}));

vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return {
    ...actual,
    default: {
      ...actual,
      createRoot: () => ({ render: mocks.renderEntry }),
    },
  };
});
vi.mock('@tanstack/react-router', () => ({ RouterProvider: () => null }));
vi.mock('@tanstack/react-query-persist-client', () => ({ persistQueryClient: vi.fn() }));
vi.mock('@/router', () => ({
  router: {
    preloadRoute: mocks.preloadRoute,
    invalidate: mocks.invalidate,
    navigate: mocks.navigate,
    history: { location: { pathname: '/workers/test-worker', href: '/workers/test-worker' } },
  },
}));
vi.mock('@/utils/authClient', () => ({
  useSession: () => mocks.session,
  refetchSession: vi.fn(),
  isVoluntaryLogout: false,
  resetVoluntaryLogout: vi.fn(),
}));
vi.mock('@/hooks/useWorkspaceSelector', () => ({
  getWorkspaceListQueryOptions: () => ({
    queryKey: ['session-test-workspaces'],
    queryFn: mocks.loadWorkspaces,
  }),
}));
vi.mock('@/services/apis/gen/queries', () => ({
  getRootControllerGetMetadataQueryKey: () => ['metadata'],
  useRootControllerGetMetadata: () => ({ data: null }),
}));
vi.mock('@/components/common/route-progress', () => ({ RouteProgress: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

let app: ReactElement;

beforeAll(async () => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  await import('@/main');
  app = mocks.renderEntry.mock.calls[0][0];
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.data = null;
  mocks.session.isPending = true;
});

describe('AppRouter session transitions', () => {
  it('does not race an authenticated reload with a dashboard route preload', async () => {
    const view = render(cloneElement(app));

    mocks.session.data = { user: { id: 'test-admin' } };
    mocks.session.isPending = false;
    view.rerender(cloneElement(app));

    await waitFor(() => expect(mocks.loadWorkspaces).toHaveBeenCalled());
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(mocks.preloadRoute).not.toHaveBeenCalled();
  });

  it('warms workspace data and refreshes route guards after sign-in without preloading matches', async () => {
    mocks.session.isPending = false;
    const view = render(cloneElement(app));
    mocks.invalidate.mockClear();

    mocks.session.data = { user: { id: 'test-admin' } };
    view.rerender(cloneElement(app));

    await waitFor(() => expect(mocks.loadWorkspaces).toHaveBeenCalled());
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(mocks.preloadRoute).not.toHaveBeenCalled();
  });

  it('still redirects an expired session to sign-in with the current return path', async () => {
    mocks.session.data = { user: { id: 'test-admin' } };
    mocks.session.isPending = false;
    const view = render(cloneElement(app));

    mocks.session.data = null;
    view.rerender(cloneElement(app));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: '/workers/test-worker' },
    }));
    expect(mocks.preloadRoute).not.toHaveBeenCalled();
  });
});
