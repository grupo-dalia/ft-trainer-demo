(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function youtubeId(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      let id;
      if (host === 'youtu.be') id = url.pathname.split('/')[1];
      else if (['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)) {
        id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(embed|shorts|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : null;
      }
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
    } catch { return null; }
  }
  function html(exercise) {
    const url = exercise.media_url || exercise.thumbnail_url || 'assets/brand/ft-symbol-color.png';
    const id = youtubeId(url);
    if (id) return `<iframe style="width:100%;aspect-ratio:16/9;border:0" src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1" title="Demostracion de ${escape(exercise.name || 'ejercicio')}" allow="fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Abrir video en YouTube ↗</a>`;
    if (!/^(https?:\/\/|assets\/)/i.test(url)) return '<p>Demostracion no disponible.</p>';
    if (exercise.media_type === 'video' || /\.(mp4|webm)(\?|$)/i.test(url)) return `<video style="width:100%;max-height:340px" controls playsinline preload="metadata" src="${escape(url)}"></video>`;
    return `<img style="width:100%;max-height:340px;object-fit:contain" src="${escape(url)}" alt="Demostracion de ${escape(exercise.name || 'ejercicio')}">`;
  }
  window.ftExerciseMedia = {youtubeId, html};
})();
