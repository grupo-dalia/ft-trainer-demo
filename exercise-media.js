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
  function vimeoVideo(value) {
    try { const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,'');
      if(!['https:','http:'].includes(url.protocol)||!['vimeo.com','player.vimeo.com'].includes(host))return null;
      const match=url.pathname.match(host==='player.vimeo.com'?/^\/video\/(\d+)\/?$/:/^\/(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/);
      if(!match)return null;const hash=url.searchParams.get('h')||match[2]||'';if(hash&&!/^[a-zA-Z0-9]+$/.test(hash))return null;
      return {id:match[1],url:`https://vimeo.com/${match[1]}${hash?'/'+hash:''}`,embed:`https://player.vimeo.com/video/${match[1]}${hash?'?h='+hash:''}`};
    }catch{return null;}
  }
  function html(exercise) {
    const url = exercise.media_url || exercise.thumbnail_url || 'assets/brand/ft-symbol-color.png';
    const id = youtubeId(url);
    if (id) return `<iframe style="width:100%;aspect-ratio:16/9;border:0" src="https://www.youtube-nocookie.com/embed/${id}?playsinline=1" title="Demostracion de ${escape(exercise.name || 'ejercicio')}" allow="fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Abrir video en YouTube ↗</a>`;
    const vimeo=vimeoVideo(url);
    if(vimeo)return `<iframe style="width:100%;aspect-ratio:16/9;border:0" src="${escape(vimeo.embed)}" title="Demostración de ${escape(exercise.name||'ejercicio')}" allow="fullscreen; picture-in-picture" allowfullscreen></iframe><a href="${escape(vimeo.url)}" target="_blank" rel="noopener">Abrir vídeo en Vimeo ↗</a>`;
    if (!/^(https?:\/\/|assets\/)/i.test(url)) return '<p>Demostracion no disponible.</p>';
    if (exercise.media_type === 'video' || /\.(mp4|webm)(\?|$)/i.test(url)) return `<video style="width:100%;max-height:340px" controls playsinline preload="metadata" src="${escape(url)}"></video>`;
    return `<img style="width:100%;max-height:340px;object-fit:contain" src="${escape(url)}" alt="Demostracion de ${escape(exercise.name || 'ejercicio')}">`;
  }
  function preview(exercise) {
    const url=exercise.media_url||'',id=youtubeId(url),vimeo=vimeoVideo(url);
    const play='<span class="catalog-video-play" aria-hidden="true">▶</span>';
    if(id)return `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Vista previa de ${escape(exercise.name)}" loading="lazy">${play}`;
    if(vimeo)return `<img src="${escape(exercise.thumbnail_url||(/^(https?:\/\/|assets\/)/i.test(url)&&!vimeo?url:'assets/brand/ft-symbol-color.png'))}" data-vimeo-preview="${escape(vimeo.url)}" alt="Vista previa de ${escape(exercise.name)}" loading="lazy">${play}`;
    if((exercise.media_type==='video'||/\.(mp4|webm)(\?|$)/i.test(url))&&/^https?:\/\//i.test(url))return `<video src="${escape(url)}#t=0.1" muted playsinline preload="metadata" aria-hidden="true"></video>${play}`;
    return `<img src="${escape(exercise.thumbnail_url||(/^(https?:\/\/|assets\/)/i.test(url)&&!vimeo?url:'assets/brand/ft-symbol-color.png'))}" alt="${escape(exercise.name)}" loading="lazy">`;
  }
  const previewCache=new Map();
  async function hydratePreviews(root) {
    await Promise.all([...root.querySelectorAll('[data-vimeo-preview]')].map(async img=>{
      const url=img.dataset.vimeoPreview;
      try{
        if(!previewCache.has(url))previewCache.set(url,fetch('https://vimeo.com/api/oembed.json?url='+encodeURIComponent(url)).then(response=>{if(!response.ok)throw Error('preview');return response.json()}).then(data=>{if(!/^https:\/\//i.test(data.thumbnail_url||''))throw Error('thumbnail');return data.thumbnail_url}));
        img.src=await previewCache.get(url);
      }catch{previewCache.delete(url);}
    }));
  }
  window.ftExerciseMedia = {youtubeId, vimeoVideo, html, preview, hydratePreviews};
})();
