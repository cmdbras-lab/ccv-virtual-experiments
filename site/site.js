(() => {
  'use strict';

  const repository = 'cmdbras-lab/ccv-virtual-experiments';
  const releasesPage = `https://github.com/${repository}/releases/latest`;
  const latestApi = `https://api.github.com/repos/${repository}/releases/latest`;

  const scriptBase = new URL('./', document.currentScript?.src || window.location.href);
  const logoSources = {
    ccvne: new URL('assets/ccvne-logo.svg', scriptBase).href,
    aeas: new URL('assets/aeas-logo.svg', scriptBase).href,
    prr: new URL('assets/prr-nextgen-logo.svg', scriptBase).href,
  };

  for (const image of document.querySelectorAll('img[data-logo]')) {
    const source = logoSources[image.dataset.logo];
    if (source) image.src = source;
  }

  const galleryDialog = document.querySelector('#gallery-dialog');
  const galleryImage = galleryDialog?.querySelector('[data-gallery-full]');
  const galleryTitle = galleryDialog?.querySelector('[data-gallery-title]');
  const galleryCaption = galleryDialog?.querySelector('[data-gallery-caption]');
  let galleryReturnFocus = null;

  const closeGallery = () => {
    if (!galleryDialog) return;
    if (typeof galleryDialog.close === 'function') galleryDialog.close();
    else galleryDialog.removeAttribute('open');
  };

  if (galleryDialog && galleryImage && galleryTitle && galleryCaption) {
    for (const trigger of document.querySelectorAll('[data-gallery-image]')) {
      trigger.addEventListener('click', () => {
        const preview = trigger.querySelector('img');
        galleryImage.src = trigger.dataset.galleryImage || '';
        galleryImage.alt = preview?.alt || trigger.dataset.galleryTitle || 'Captura ampliada do jogo';
        galleryTitle.textContent = trigger.dataset.galleryTitle || '';
        galleryCaption.textContent = trigger.dataset.galleryCaption || '';
        galleryReturnFocus = trigger;
        if (typeof galleryDialog.showModal === 'function') galleryDialog.showModal();
        else galleryDialog.setAttribute('open', '');
      });
    }

    galleryDialog.querySelector('[data-gallery-close]')?.addEventListener('click', closeGallery);
    galleryDialog.addEventListener('click', (event) => {
      if (event.target === galleryDialog) closeGallery();
    });
    galleryDialog.addEventListener('close', () => galleryReturnFocus?.focus());
  }

  const setText = (selector, value) => {
    for (const element of document.querySelectorAll(selector)) element.textContent = value;
  };

  const setHref = (selector, value) => {
    for (const element of document.querySelectorAll(selector)) element.href = value;
  };

  const readableDate = (isoDate) => {
    if (!isoDate) return '';
    return new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date(isoDate));
  };

  const formatDownloads = (count) => new Intl.NumberFormat('pt-PT').format(count || 0);

  const chooseAsset = (assets, matcher) => assets.find((asset) => matcher.test(asset.name));

  const markStatus = (state, message) => {
    const dot = document.querySelector('.status-dot');
    if (dot) {
      dot.classList.remove('ready', 'error');
      if (state) dot.classList.add(state);
    }
    setText('[data-release-status]', message);
  };

  setHref('[data-release-link]', releasesPage);
  setHref('[data-execution-download]', releasesPage);
  setHref('[data-complete-download]', releasesPage);

  fetch(latestApi, {
    headers: { Accept: 'application/vnd.github+json' },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`GitHub respondeu com ${response.status}`);
      return response.json();
    })
    .then((release) => {
      const version = release.name || release.tag_name || 'Versão mais recente';
      const releaseUrl = release.html_url || releasesPage;
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const execution = chooseAsset(assets, /-execucao\.zip$/i);
      const complete = chooseAsset(assets, /-completo\.zip$/i);
      const checksums = chooseAsset(assets, /sha256.*\.txt$|sha256\.txt$/i);

      setText('[data-release-version]', version);
      setText('[data-release-date]', release.published_at
        ? `Publicada em ${readableDate(release.published_at)}.`
        : 'Release mais recente publicada no GitHub.');
      setHref('[data-release-link]', releaseUrl);
      setHref('[data-execution-download]', execution?.browser_download_url || releaseUrl);
      setHref('[data-complete-download]', complete?.browser_download_url || releaseUrl);

      const total = assets.reduce((sum, asset) => sum + (Number(asset.download_count) || 0), 0);
      const details = [];
      if (total > 0) details.push(`${formatDownloads(total)} downloads contabilizados nesta Release`);
      if (checksums) details.push('ficheiro SHA-256 disponível');
      setText('[data-download-count]', details.join(' · '));

      markStatus('ready', `${version} disponível para download`);
    })
    .catch((error) => {
      console.warn('Não foi possível consultar a última Release:', error);
      setText('[data-release-version]', 'Versão mais recente');
      setText('[data-release-date]', 'Abra a página de Releases para consultar e descarregar a publicação mais recente.');
      markStatus('error', 'O GitHub não respondeu; o botão abre a página da última Release');
    });
})();
