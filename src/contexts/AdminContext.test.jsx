import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AdminProvider, useAdmin } from './AdminContext';

// Mock Firebase
vi.mock('../services/firebase', () => ({
  database: {},
  auth: { currentUser: { uid: 'test-uid' } },
  onAuthChange: vi.fn((cb) => {
    cb({ uid: 'test-uid' });
    return vi.fn(); // unsubscribe
  }),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn((ref, cb) => {
    cb({ val: () => 'admin' });
    return vi.fn(); // unsubscribe
  }),
}));

function TestConsumer() {
  const { isAdmin } = useAdmin();
  return <div>{isAdmin ? 'admin' : 'citizen'}</div>;
}

describe('AdminContext', () => {
  it('exposes isAdmin true when role is admin', () => {
    render(
      <AdminProvider>
        <TestConsumer />
      </AdminProvider>
    );
    expect(screen.getByText('admin')).toBeInTheDocument();
  });
});
