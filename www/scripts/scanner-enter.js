function bindEnterAction(selector, fn) {
  $(document).on('keydown', selector, function (e) {
    if (e.key !== 'Enter' && e.keyCode !== 13) return;
    e.preventDefault();
    fn.call(this, e);
  });
}
