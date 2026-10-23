import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardRouteValidator from '../validators/DashboardRouteValidator';

const mockNavigate = vi.fn();
let mockLocationPathname = '/home';

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockLocationPathname }),
}));

let mockIsDesktop = true;
vi.mock('../../hooks/useDeviceDetection', () => ({
  default: () => ({ isDesktop: mockIsDesktop }),
}));

describe('DashboardRouteValidator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children for valid routes', () => {
    mockLocationPathname = '/home';
    const { getByText } = render(
      <DashboardRouteValidator>
        <div>Valid Child</div>
      </DashboardRouteValidator>
    );

    expect(getByText('Valid Child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects to 404 for invalid routes', () => {
    mockLocationPathname = '/invalid-route-123';
    render(
      <DashboardRouteValidator>
        <div>Invalid Child</div>
      </DashboardRouteValidator>
    );

    expect(mockNavigate).toHaveBeenCalledWith('/404', { replace: true });
  });

  it('allows /hub only on mobile', () => {
    mockLocationPathname = '/hub';
    
    // Test on desktop
    mockIsDesktop = true;
    const { unmount } = render(<DashboardRouteValidator><div>Child</div></DashboardRouteValidator>);
    expect(mockNavigate).toHaveBeenCalledWith('/404', { replace: true });
    
    unmount();
    vi.clearAllMocks();

    // Test on mobile
    mockIsDesktop = false;
    render(<DashboardRouteValidator><div>Child</div></DashboardRouteValidator>);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('allows nested dynamic routes like /guides/:guideId', () => {
    mockLocationPathname = '/guides/my-awesome-guide';
    render(<DashboardRouteValidator><div>Child</div></DashboardRouteValidator>);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('allows movies recommendations routes', () => {
    mockLocationPathname = '/recommendations/movies/trending';
    render(<DashboardRouteValidator><div>Child</div></DashboardRouteValidator>);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each(['/recommendations/places/list-1', '/recommendations/places/list-1/add', '/recommendations/places/list-1/edit/place-1'])(
    'allows the shared Places list, add and edit route %s', (path) => {
      mockLocationPathname = path;
      render(<DashboardRouteValidator><div>Child</div></DashboardRouteValidator>);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

  it('still refuses an unknown Places sub-route', () => {
    mockLocationPathname = '/recommendations/places/list-1/unknown';
    render(<DashboardRouteValidator><div>Child</div></DashboardRouteValidator>);
    expect(mockNavigate).toHaveBeenCalled();
  });
});
