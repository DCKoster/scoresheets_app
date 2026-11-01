export function showView(nextView, views, tabButtons) {
  Object.entries(views).forEach(([key, panel]) => {
    panel.classList.toggle('hidden', key !== nextView);
  });

  tabButtons.forEach((button) => {
    const isActive = button.dataset.view === nextView;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

export function wireTabNavigation(tabButtons, views, onSelect) {
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextView = button.dataset.view;
      if (nextView && views[nextView]) {
        onSelect(nextView);
      }
    });
  });
}
