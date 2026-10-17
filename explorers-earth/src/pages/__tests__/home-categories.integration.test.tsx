import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { MockedProvider } from '@apollo/client/testing';
import { CreateMovieListModal } from '../../features/Movies/components/dashboard/MoviesHome';
import { explorersApiClient } from '../../lib/explorersApiClient';

// Mock getCanonicalUrl / domain helpers
vi.mock('../../utils/getCurrentDomain', () => ({
  getCurrentDomain: () => 'http://localhost:3000',
}));

// Integration wrapper representing Home categories/lists dashboard
const HomeCategoriesDashboard = () => {
  const tabs = [
    { id: 'movies', label: 'Movies' },
    { id: 'books', label: 'Books' },
    { id: 'games', label: 'Games' },
    { id: 'music', label: 'Music' },
    { id: 'products', label: 'Products' },
    { id: 'apps', label: 'Apps & Tools' },
    { id: 'people', label: 'People' },
    { id: 'locations', label: 'Locations' },
    { id: 'guides', label: 'Guides' },
  ];

  const [activeTab, setActiveTab] = useState('movies');
  const [modalOpen, setModalOpen] = useState(false);
  const [lists, setLists] = useState<Record<string, string[]>>({
    movies: [],
    books: ['My Books List'],
  });

  return (
    <div>
      {/* Category Tab Switcher */}
      <div role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div role="tabpanel">
        <h2 data-testid="tab-title">Active: {tabs.find(t => t.id === activeTab)?.label}</h2>

        {/* Empty State vs List content */}
        {!lists[activeTab] || lists[activeTab].length === 0 ? (
          <div data-testid="empty-state">No items in this list</div>
        ) : (
          <ul data-testid="list-content">
            {lists[activeTab].map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        )}

        <button onClick={() => setModalOpen(true)}>Add List</button>
      </div>

      {/* Actual Movies list creation modal from the codebase */}
      <CreateMovieListModal
        open={modalOpen && activeTab === 'movies'}
        onClose={() => setModalOpen(false)}
        accountDocumentId="acc_123"
        currentListCount={0}
        onCreated={(newId) => {
          setLists(prev => ({
            ...prev,
            movies: [...(prev.movies || []), `New List ID: ${newId || 'mock-id'}`]
          }));
        }}
        username="testuser"
      />
    </div>
  );
};

describe('Home Categories Tab switching and List creation integration', () => {
  it('renders all 9 category tabs and displays correct empty states or contents', () => {
    render(
      <MockedProvider mocks={[]}>
        <HomeCategoriesDashboard />
      </MockedProvider>
    );

    // Assert all 9 category tabs are rendered
    const tabs = ['Movies', 'Books', 'Games', 'Music', 'Products', 'Apps & Tools', 'People', 'Locations', 'Guides'];
    tabs.forEach(tabLabel => {
      expect(screen.getByRole('tab', { name: tabLabel })).toBeInTheDocument();
    });

    // Verify initial active tab is Movies and shows empty state
    expect(screen.getByTestId('tab-title')).toHaveTextContent('Active: Movies');
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No items in this list');

    // Switch tab to Books
    fireEvent.click(screen.getByRole('tab', { name: 'Books' }));
    expect(screen.getByTestId('tab-title')).toHaveTextContent('Active: Books');
    expect(screen.getByTestId('list-content')).toHaveTextContent('My Books List');
  });

  // Retains Formik validation and native observed creation through the actual modal.
  it('opens movie creation modal, triggers Formik validation, and creates list successfully on submit', { timeout: 30000 }, async () => {
    const createList=vi.spyOn(explorersApiClient,'createMyCollection').mockResolvedValue({id:'movie_list_doc_id'} as never);
    render(
      <MockedProvider mocks={[]}>
        <HomeCategoriesDashboard />
      </MockedProvider>
    );

    // Open list creation modal
    fireEvent.click(screen.getByRole('button', { name: 'Add List' }));
    expect(screen.getByRole('heading', { name: 'Create New List' })).toBeInTheDocument();

    // Trigger validation error by typing empty name
    const submitBtn = screen.getByRole('button', { name: 'Create List' });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByText('List name is required')).toBeInTheDocument();
    });

    // Fill form and submit successfully
    const nameInput = screen.getByPlaceholderText(/Enter List Name/);
    fireEvent.change(nameInput, { target: { value: 'Top Sci-Fi Movies' } });

    const descInput = screen.getByPlaceholderText(/Enter a note or description/);
    fireEvent.change(descInput, { target: { value: 'My favorite mind-bending movies' } });

    fireEvent.click(submitBtn);

    // Verify it closed the modal and updated the list panel
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Create New List' })).not.toBeInTheDocument();
      expect(screen.getByTestId('list-content')).toHaveTextContent('New List ID: movie_list_doc_id');
      expect(createList).toHaveBeenCalledWith(expect.objectContaining({category:'movies',title:'Top Sci-Fi Movies',description:'My favorite mind-bending movies',slug:'top-sci-fi-movies',visibility:'private',publicationState:'draft'}),expect.any(String));
    });
  });
});
