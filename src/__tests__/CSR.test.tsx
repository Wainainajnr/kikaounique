import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CSR from '@/pages/CSR';

import { vi } from 'vitest';

// Mock supabase client used by the CSR component
const mockProjects = [
  { id: 'p1', title: 'P1', description: 'Desc', start_date: '2025-01-01', csr_contributions: [] }
];

const mockInsertProject = vi.fn(async (payload: any) => ({ data: { id: 'p2', ...payload }, error: null }));
const mockInsertContribution = vi.fn(async (payload: any) => ({ data: { id: 'c1', ...payload }, error: null }));

const mockFrom = vi.fn((table: string) => ({
  select: vi.fn(() => ({ data: mockProjects, error: null })),
  insert: (payload: any) => ({ select: () => ({ single: () => (table === 'csr_projects' ? mockInsertProject(payload) : mockInsertContribution(payload)) }) })
}));

const mockChannel = () => ({
  on: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }) }),
  subscribe: () => ({})
});

vi.mock('@/integrations/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    auth: { signOut: vi.fn(), getSession: vi.fn() }
  }
}));

describe('CSR page', () => {
  test('fetches and displays projects', async () => {
    render(<CSR />);
    await waitFor(() => expect(screen.getByText('Social Responsibility (CSR)')).toBeInTheDocument());
    // should list project title
    expect(screen.getByText('P1')).toBeInTheDocument();
  });

  test('adds a new project and shows it immediately', async () => {
    render(<CSR />);
    // open add project dialog
    userEvent.click(screen.getByText('Add CSR Project'));
    // fill form
    userEvent.type(screen.getByPlaceholderText('Enter project name'), 'New Project');
    userEvent.type(screen.getByPlaceholderText('Describe the project briefly'), 'New Desc');
    // Validate admin: open sign-in
    userEvent.click(screen.getByText('Add Project'));
    // sign-in modal should show
    await waitFor(() => expect(screen.getByText('Admin Sign-in')).toBeInTheDocument());
    userEvent.type(screen.getByPlaceholderText('Admin password'), 'Admin@123');
    userEvent.click(screen.getByText('Sign in'));
    // after sign in, re-click add project
    userEvent.click(screen.getByText('Add Project'));

    await waitFor(() => expect(mockInsertProject).toHaveBeenCalled());
    // new project should appear
    await waitFor(() => expect(screen.getByText('New Project')).toBeInTheDocument());
  });

  test('adds a contribution and shows under project', async () => {
    render(<CSR />);
    // open add contribution dialog
    userEvent.click(screen.getByText('Add Member Contribution'));
    // select project
    userEvent.selectOptions(screen.getByRole('combobox'), 'p1');
    userEvent.type(screen.getByPlaceholderText('Enter contribution amount'), '500');
    // trigger sign-in modal by trying to add
    userEvent.click(screen.getByText('Add Contribution'));
    await waitFor(() => expect(screen.getByText('Admin Sign-in')).toBeInTheDocument());
    userEvent.type(screen.getByPlaceholderText('Admin password'), 'Admin@123');
    userEvent.click(screen.getByText('Sign in'));
    userEvent.click(screen.getByText('Add Contribution'));

    await waitFor(() => expect(mockInsertContribution).toHaveBeenCalled());
    // the contribution should be shown under project (amount formatted KES won't be exact in test, check for amount number)
    await waitFor(() => expect(screen.getByText(/500/)).toBeInTheDocument());
  });
});
