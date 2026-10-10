// Restore dark mode preference
if (localStorage.getItem('kcalc-dark') === '1' || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('kcalc-dark'))) {
  document.body.classList.add('dark');
}
document.querySelector('.dark-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('kcalc-dark', document.body.classList.contains('dark') ? '1' : '0');
});
