(() => {
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const commandKey = event.ctrlKey || event.metaKey;
    const devtoolsShortcut = key === 'f12'
      || (commandKey && event.shiftKey && ['i', 'j', 'c'].includes(key))
      || (commandKey && key === 'u');

    if (devtoolsShortcut) event.preventDefault();
  });
})();
