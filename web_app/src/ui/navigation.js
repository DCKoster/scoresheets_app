export function showView(nextView, views, tabButtons) {
  Object.entries(views).forEach(([key, panel]) => {
    panel.classList.toggle('hidden', key !== nextView);
  });

  tabButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === nextView);
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
